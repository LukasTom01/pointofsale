"use server";

// Akce administrace modulu Tým (úkoly, akce, pozice, směny, docházka, lidé).
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminServer";
import { getStaff, listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { saveUploads } from "@/lib/team/attachments";
import {
  copyTargets,
  doneAtFor,
  isDay,
  isTaskStatus,
  parseShiftTimes,
  parseTime,
  pragueInstant,
} from "@/lib/team/domain";
import type { Attendance } from "@/lib/team/types";

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
  });
  const uploadError = await saveUploads(task.id, fd);
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
  await teamStore.updateTask({
    ...task,
    title,
    note: text(fd, "note", 4000) || null,
    status,
    doneAt: doneAtFor(status, task.doneAt, new Date().toISOString()),
    ...parseDue(fd),
    eventId: await validEventId(text(fd, "eventId")),
    assigneeIds: await validStaffIds(fd.getAll("assignee").map(String)),
  });
  const uploadError = await saveUploads(task.id, fd);
  refresh();
  if (uploadError) return { error: `Uloženo, ale přílohy ne: ${uploadError}` };
  return { ok: "Uloženo." };
}

/** Zaškrtnutí hotovo / vrácení ze seznamu. */
export async function toggleTaskDone(fd: FormData) {
  await requireAdmin();
  const task = await teamStore.getTask(text(fd, "taskId"));
  if (!task) return;
  const status = task.status === "done" ? "todo" : "done";
  await teamStore.updateTask({ ...task, status, doneAt: doneAtFor(status, task.doneAt, new Date().toISOString()) });
  refresh();
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
  refresh();
  return { ok: "Směna uložena." };
}

export async function deleteShift(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  await teamStore.deleteShift(text(fd, "shiftId"));
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
