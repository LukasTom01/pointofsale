"use server";

// Akce administrace modulu Tým (úkoly, akce, pozice, směny, docházka, lidé).
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminServer";
import { getStaff, listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { copyAttachments, saveUploads } from "@/lib/team/attachments";
import {
  adminToggle,
  approveTask as approve,
  copyDueDates,
  copyTargets,
  doneAtFor,
  isDay,
  isTaskStatus,
  parseChecklist,
  parseShiftTimes,
  parseTime,
  pragueInstant,
  returnTask as giveBack,
} from "@/lib/team/domain";
import { notifyAssigned, notifyResolved, notifyReturned } from "@/lib/team/notify";
import { syncRoleTasks } from "@/lib/team/role-tasks";
import type { Attendance, Task, TaskLogKind } from "@/lib/team/types";

export type FormState = { ok?: string; error?: string } | undefined;

const refresh = () => {
  revalidatePath("/admin", "layout");
  revalidatePath("/muj", "layout");
};
const text = (fd: FormData, key: string, max = 300) => String(fd.get(key) ?? "").trim().slice(0, max);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

async function validStaffIds(ids: string[]): Promise<string[]> {
  const known = new Set((await listStaff()).map((s) => s.id));
  return [...new Set(ids)].filter((id) => known.has(id));
}
/** Termín z formuláře: den + volitelný čas (čas bez dne se ignoruje). */
function parseDue(fd: FormData): { dueDate: string | null; dueTime: number | null } {
  const day = text(fd, "dueDate");
  if (!isDay(day)) return { dueDate: null, dueTime: null };
  const time = text(fd, "dueTime");
  return { dueDate: day, dueTime: time ? parseTime(time) : null };
}

async function validEventId(id: string): Promise<string | null> {
  if (!id) return null;
  return (await teamStore.listEvents()).some((e) => e.id === id) ? id : null;
}
async function validRoleId(id: string): Promise<string | null> {
  if (!id) return null;
  return (await teamStore.listRoles()).some((r) => r.id === id) ? id : null;
}

// --- Úkoly -------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const log = (taskId: string, kind: TaskLogKind, text: string | null = null) =>
  teamStore.addTaskLog({ taskId, staffId: null, kind, text }).catch(() => undefined);

/** Volby úkolu z formuláře (fotka, kontrola, připomínka, způsob splnění, checklist). */
function parseOptions(fd: FormData, existing?: Task) {
  const remindRaw = text(fd, "remindMin");
  const remind = remindRaw === "" ? null : Number(remindRaw);
  return {
    completion: text(fd, "completion") === "any" ? ("any" as const) : ("each" as const),
    requiresPhoto: fd.get("requiresPhoto") === "1",
    requiresReview: fd.get("requiresReview") === "1",
    remindMin: remind != null && Number.isFinite(remind) && remind >= 0 && remind <= 24 * 60 ? remind : null,
    checklist: parseChecklist(text(fd, "checklist", 8000), existing?.checklist),
  };
}

export async function createTask(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const title = text(fd, "title", 200);
  if (!title) return { error: "Zadejte název úkolu." };
  const task = await teamStore.createTask({
    title,
    note: text(fd, "note", 4000) || null,
    ...parseDue(fd),
    eventId: await validEventId(text(fd, "eventId")),
    assigneeIds: await validStaffIds(fd.getAll("assignee").map(String)),
    ...parseOptions(fd),
  });
  await log(task.id, "created");
  const uploadError = await saveUploads(task.id, fd);
  await notifyAssigned([task], task.assigneeIds);
  refresh();
  if (uploadError) return { error: `Úkol přidán, ale přílohy ne: ${uploadError}` };
  return { ok: "Úkol přidán." };
}

export async function updateTask(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const task = await teamStore.getTask(text(fd, "taskId"));
  if (!task) return { error: "Úkol nenalezen." };
  const title = text(fd, "title", 200);
  if (!title) return { error: "Zadejte název úkolu." };
  const statusRaw = text(fd, "status");
  const status = isTaskStatus(statusRaw) ? statusRaw : task.status;
  const assigneeIds = await validStaffIds(fd.getAll("assignee").map(String));
  const next = await teamStore.updateTask({
    ...task,
    title,
    note: text(fd, "note", 4000) || null,
    status,
    doneAt: doneAtFor(status, task.doneAt, nowIso()),
    doneBy: status === "todo" ? [] : task.doneBy.filter((id) => assigneeIds.includes(id)),
    ...parseDue(fd),
    eventId: await validEventId(text(fd, "eventId")),
    assigneeIds,
    ...parseOptions(fd, task),
  });
  await log(task.id, "edited");
  const uploadError = await saveUploads(task.id, fd);
  const added = assigneeIds.filter((id) => !task.assigneeIds.includes(id));
  if (next && added.length) await notifyAssigned([next], added);
  refresh();
  if (uploadError) return { error: `Uloženo, ale přílohy ne: ${uploadError}` };
  return { ok: "Uloženo." };
}

/** Zaškrtnutí hotovo / vrácení ze seznamu (za všechny). */
export async function toggleTaskDone(fd: FormData) {
  await requireAdmin();
  const task = await teamStore.getTask(text(fd, "taskId"));
  if (!task) return;
  const next = adminToggle(task, nowIso());
  await teamStore.updateTask(next);
  await log(task.id, next.status === "done" ? "done" : "undone");
  refresh();
}

/** Kontrola: schválit. */
export async function approveTask(fd: FormData) {
  await requireAdmin();
  const task = await teamStore.getTask(text(fd, "taskId"));
  if (!task || task.status !== "review") return;
  await teamStore.updateTask(approve(task, nowIso()));
  await log(task.id, "approved");
  refresh();
}

/** Kontrola: vrátit k dopracování s komentářem (přijde jim notifikace). */
export async function returnTask(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const task = await teamStore.getTask(text(fd, "taskId"));
  if (!task) return { error: "Úkol nenalezen." };
  const note = text(fd, "adminNote", 500) || null;
  const next = giveBack(task, note);
  await teamStore.updateTask(next);
  await log(task.id, "returned", note);
  await notifyReturned(next, note);
  refresh();
  return { ok: "Vráceno." };
}

/** Problém vyřešen (volitelná odpověď přijde brigádníkovi). */
export async function resolveProblem(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const task = await teamStore.getTask(text(fd, "taskId"));
  if (!task?.problem) return { error: "Problém už je vyřešený." };
  const note = text(fd, "adminNote", 500) || null;
  const reporter = task.problem.staffId;
  const next = { ...task, problem: null, adminNote: note ?? task.adminNote };
  await teamStore.updateTask(next);
  await log(task.id, "resolved", note);
  await notifyResolved(next, reporter, note);
  refresh();
  return { ok: "Vyřešeno." };
}

export async function deleteTask(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  await teamStore.deleteTask(text(fd, "taskId"));
  refresh();
  return { ok: "Úkol smazán." };
}

export async function deleteAttachment(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  await teamStore.deleteAttachment(text(fd, "attachmentId"));
  refresh();
  return { ok: "Příloha smazána." };
}

/**
 * Hromadné akce s vybranými úkoly: kopie (na jiný den, jiným lidem) nebo smazání.
 * Při kopii se první termín výběru posune na zvolený den, ostatní drží rozestup.
 */
export async function bulkTasks(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const ids = [...new Set(fd.getAll("sel").map(String))];
  const all = await teamStore.listTasks();
  const chosen = all.filter((t) => ids.includes(t.id));
  if (chosen.length === 0) return { error: "Nejdřív zaškrtněte úkoly v seznamu (políčko vlevo)." };

  if (text(fd, "op") === "delete") {
    for (const t of chosen) await teamStore.deleteTask(t.id);
    refresh();
    return { ok: `Smazáno ${chosen.length} úkolů.` };
  }

  const day = text(fd, "copyDay");
  const dates = copyDueDates(chosen, isDay(day) ? day : null);
  const people = await validStaffIds(fd.getAll("copyAssignee").map(String));
  const eventRaw = text(fd, "copyEvent");
  const eventId = eventRaw === "keep" ? undefined : await validEventId(eventRaw);
  const created: Task[] = [];
  for (const t of chosen) {
    const copy = await teamStore.createTask({
      title: t.title,
      note: t.note,
      dueDate: dates.get(t.id) ?? null,
      dueTime: t.dueTime,
      eventId: eventId === undefined ? t.eventId : eventId,
      assigneeIds: people.length ? people : t.assigneeIds,
      completion: t.completion,
      requiresPhoto: t.requiresPhoto,
      requiresReview: t.requiresReview,
      remindMin: t.remindMin,
      checklist: parseChecklist(t.checklist.map((i) => i.text).join("\n")),
    });
    await copyAttachments(t.id, copy.id);
    await log(copy.id, "copied", t.title);
    created.push(copy);
  }
  await notifyAssigned(created, [...new Set(created.flatMap((t) => t.assigneeIds))]);
  refresh();
  return { ok: `Vytvořeno ${created.length} kopií.` };
}

// --- Úkoly pozic -------------------------------------------------------------

export async function saveRoleTask(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const roleId = await validRoleId(text(fd, "roleId"));
  if (!roleId) return { error: "Vyberte pozici." };
  const title = text(fd, "title", 200);
  if (!title) return { error: "Zadejte název úkolu." };
  const offset = Number(text(fd, "offsetMin") || 0);
  const opts = parseOptions(fd);
  await teamStore.saveRoleTask({
    id: text(fd, "roleTaskId") || undefined,
    roleId,
    title,
    note: text(fd, "note", 4000) || null,
    checklist: opts.checklist.map((i) => i.text),
    anchor: text(fd, "anchor") === "end" ? "end" : "start",
    offsetMin: Number.isFinite(offset) ? Math.max(-720, Math.min(720, Math.round(offset))) : 0,
    requiresPhoto: opts.requiresPhoto,
    requiresReview: opts.requiresReview,
    remindMin: opts.remindMin,
  });
  const n = await syncRoleTasks();
  refresh();
  return { ok: n ? `Uloženo · upraveno ${n} úkolů ve směnách.` : "Uloženo." };
}

export async function deleteRoleTask(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  await teamStore.deleteRoleTask(text(fd, "roleTaskId"));
  await syncRoleTasks();
  refresh();
  return { ok: "Smazáno." };
}

// --- Push notifikace vedoucího -------------------------------------------------

export async function saveAdminPush(sub: { endpoint: string; p256dh: string; auth: string }) {
  await requireAdmin();
  if (!sub?.endpoint?.startsWith("https://") || !sub.p256dh || !sub.auth) return;
  await teamStore.savePushSub({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, staffId: null });
}

export async function removeAdminPush(endpoint: string) {
  await requireAdmin();
  const sub = (await teamStore.listPushSubs()).find((s) => s.endpoint === endpoint);
  if (sub && sub.staffId == null) await teamStore.deletePushSub(endpoint);
}

// --- Akce a pozice -----------------------------------------------------------

export async function saveEvent(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = text(fd, "name", 120);
  const from = text(fd, "dateFrom");
  const to = text(fd, "dateTo");
  if (!name) return { error: "Zadejte název akce." };
  if ((from && !isDay(from)) || (to && !isDay(to)) || (from && to && from > to)) {
    return { error: "Zkontrolujte data – „od“ musí být před „do“." };
  }
  await teamStore.saveEvent({
    id: text(fd, "eventId") || undefined,
    name,
    dateFrom: from || null,
    dateTo: to || from || null,
  });
  refresh();
  return { ok: "Uloženo." };
}

export async function deleteEvent(fd: FormData) {
  await requireAdmin();
  await teamStore.deleteEvent(text(fd, "eventId"));
  refresh();
}

export async function saveRole(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = text(fd, "name", 60);
  if (!name) return { error: "Zadejte název pozice." };
  const color = text(fd, "color");
  await teamStore.saveRole({ id: text(fd, "roleId") || undefined, name, color: COLOR_RE.test(color) ? color : null });
  refresh();
  return { ok: "Uloženo." };
}

export async function deleteRole(fd: FormData) {
  await requireAdmin();
  await teamStore.deleteRole(text(fd, "roleId"));
  await syncRoleTasks();
  refresh();
}

// --- Směny -------------------------------------------------------------------

export async function saveShift(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const times = parseShiftTimes(text(fd, "from"), text(fd, "to"));
  if (!times) return { error: "Zkontrolujte časy – začátek musí být před koncem (v rámci jednoho dne)." };
  const day = text(fd, "day");
  const staffId = text(fd, "staffId");
  if (!isDay(day) || !(await getStaff(staffId))) return { error: "Neplatný den nebo člověk." };
  const values = {
    staffId,
    day,
    ...times,
    roleId: await validRoleId(text(fd, "roleId")),
    eventId: await validEventId(text(fd, "eventId")),
    note: text(fd, "note") || null,
  };
  const shiftId = text(fd, "shiftId");
  if (shiftId) {
    const shift = await teamStore.getShift(shiftId);
    if (!shift) return { error: "Směna nenalezena." };
    await teamStore.updateShift({ ...shift, ...values });
  } else {
    await teamStore.createShifts([values]);
  }
  await syncRoleTasks();
  refresh();
  return { ok: "Směna uložena." };
}

export async function deleteShift(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  await teamStore.deleteShift(text(fd, "shiftId"));
  await syncRoleTasks();
  refresh();
  return { ok: "Směna smazána." };
}

/** Zkopíruje směnu (časy, pozici, akci) na vybrané lidi × dny. */
export async function copyShift(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const source = await teamStore.getShift(text(fd, "shiftId"));
  if (!source) return { error: "Směna nenalezena." };
  const people = await validStaffIds(fd.getAll("copyStaff").map(String));
  const targets = copyTargets(source, people, fd.getAll("copyDay").map(String));
  if (targets.length === 0) return { error: "Vyberte jiný den nebo člověka." };
  await teamStore.createShifts(
    targets.map((t) => ({
      staffId: t.staffId,
      day: t.day,
      startMin: source.startMin,
      endMin: source.endMin,
      roleId: source.roleId,
      eventId: source.eventId,
      note: source.note,
    })),
  );
  await syncRoleTasks();
  refresh();
  return { ok: `Vytvořeno ${targets.length} kopií.` };
}

// --- Docházka (koordinátor) -------------------------------------------------

/** Přišel / nepřišel / zpět na plán. „Přišel“ bez příchodu doplní plánovaný začátek. */
export async function setAttendance(fd: FormData) {
  await requireAdmin();
  const shift = await teamStore.getShift(text(fd, "shiftId"));
  const value = text(fd, "attendance") as Attendance;
  if (!shift || !["planned", "present", "absent"].includes(value)) return;
  await teamStore.updateShift(
    value === "present"
      ? { ...shift, attendance: "present", checkInAt: shift.checkInAt ?? pragueInstant(shift.day, shift.startMin).toISOString() }
      : { ...shift, attendance: value, checkInAt: null, checkOutAt: null },
  );
  refresh();
}

/** Oprava příchodu a odchodu (český čas v den směny). */
export async function setShiftTimes(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const shift = await teamStore.getShift(text(fd, "shiftId"));
  if (!shift) return { error: "Směna nenalezena." };
  const arrived = parseTime(text(fd, "arrived"));
  const leftRaw = text(fd, "left");
  const left = leftRaw ? parseTime(leftRaw) : null;
  if (arrived == null || (leftRaw && (left == null || left <= arrived))) {
    return { error: "Odchod musí být po příchodu." };
  }
  await teamStore.updateShift({
    ...shift,
    attendance: "present",
    checkInAt: pragueInstant(shift.day, arrived).toISOString(),
    checkOutAt: left != null ? pragueInstant(shift.day, left).toISOString() : null,
  });
  refresh();
  return { ok: "Uloženo." };
}

// --- Lidé: kontakt a osobní odkaz ----------------------------------------------

export async function saveProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const staffId = text(fd, "staffId");
  if (!(await getStaff(staffId))) return { error: "Člověk nenalezen." };
  const current = (await teamStore.listProfiles()).find((p) => p.staffId === staffId);
  await teamStore.saveProfile({
    staffId,
    phone: text(fd, "phone", 40) || null,
    note: text(fd, "note", 300) || null,
    token: current?.token ?? null,
  });
  refresh();
  return { ok: "Uloženo." };
}

/** Nový osobní odkaz (starý přestane platit), nebo zrušení odkazu. */
export async function setPersonalLink(fd: FormData) {
  await requireAdmin();
  const staffId = text(fd, "staffId");
  if (!(await getStaff(staffId))) return;
  const current = (await teamStore.listProfiles()).find((p) => p.staffId === staffId);
  await teamStore.saveProfile({
    staffId,
    phone: current?.phone ?? null,
    note: current?.note ?? null,
    token: fd.get("mode") === "revoke" ? null : crypto.randomBytes(18).toString("base64url"),
  });
  refresh();
}
