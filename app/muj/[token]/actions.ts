"use server";

// Akce osobního přehledu pracovníka. Oprávnění = platný osobní token
// a vlastnictví směny / přiřazení úkolu. Admin heslo se zde nevyžaduje.
import { revalidatePath } from "next/cache";
import { getStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { saveUploads } from "@/lib/team/attachments";
import { notifyAdmin } from "@/lib/team/notify";
import { canCheckIn, canCheckOut, completeFor, isDoneFor, pragueToday, toggleChecklistItem, uncompleteFor } from "@/lib/team/domain";
import type { Task, TaskLogKind } from "@/lib/team/types";

async function staffForToken(token: string) {
  if (!token || token.length < 16) return null;
  const profile = await teamStore.profileByToken(token);
  if (!profile) return null;
  return (await getStaff(profile.staffId)) ? profile.staffId : null;
}

/** Úkol, ke kterému je držitel tokenu přiřazený. */
async function myTask(fd: FormData): Promise<{ staffId: string; task: Task } | null> {
  const staffId = await staffForToken(String(fd.get("token") ?? ""));
  if (!staffId) return null;
  const task = await teamStore.getTask(String(fd.get("taskId") ?? ""));
  return task && task.assigneeIds.includes(staffId) ? { staffId, task } : null;
}

const log = (taskId: string, staffId: string, kind: TaskLogKind, text: string | null = null) =>
  teamStore.addTaskLog({ taskId, staffId, kind, text }).catch(() => undefined);

const done = () => {
  revalidatePath("/muj", "layout");
  revalidatePath("/admin", "layout");
};

export async function checkIn(fd: FormData) {
  const staffId = await staffForToken(String(fd.get("token") ?? ""));
  const shift = await teamStore.getShift(String(fd.get("shiftId") ?? ""));
  if (!staffId || !shift || shift.staffId !== staffId || !canCheckIn(shift, pragueToday())) return;
  await teamStore.updateShift({ ...shift, attendance: "present", checkInAt: new Date().toISOString() });
  done();
}

export async function checkOut(fd: FormData) {
  const staffId = await staffForToken(String(fd.get("token") ?? ""));
  const shift = await teamStore.getShift(String(fd.get("shiftId") ?? ""));
  if (!staffId || !shift || shift.staffId !== staffId || !canCheckOut(shift)) return;
  await teamStore.updateShift({ ...shift, checkOutAt: new Date().toISOString() });
  done();
}

/** Po splnění: když úkol čeká na kontrolu, dá vedení vědět. */
async function afterComplete(before: Task, after: Task, staffId: string) {
  await log(after.id, staffId, "done");
  if (before.status !== "review" && after.status === "review") {
    await log(after.id, staffId, "review");
    await notifyAdmin(after, "review", staffId);
  }
}

/** Odškrtnutí / vrácení vlastní části úkolu. Úkol s povinnou fotkou jde splnit jen s fotkou. */
export async function toggleMyTask(fd: FormData) {
  const mine = await myTask(fd);
  if (!mine) return;
  const { staffId, task } = mine;
  if (isDoneFor(task, staffId)) {
    const next = uncompleteFor(task, staffId);
    if (next !== task) {
      await teamStore.updateTask(next);
      await log(task.id, staffId, "undone");
    }
  } else {
    if (task.requiresPhoto) return;
    const next = completeFor(task, staffId, new Date().toISOString());
    await teamStore.updateTask(next);
    await afterComplete(task, next, staffId);
  }
  done();
}

export type PhotoState = { error?: string; ok?: boolean } | undefined;

/** Fotka jako důkaz: uloží fotku a rovnou odškrtne úkol. */
export async function completeWithPhoto(_prev: PhotoState, fd: FormData): Promise<PhotoState> {
  const mine = await myTask(fd);
  if (!mine) return { error: "Úkol nenalezen." };
  const { staffId, task } = mine;
  const err = await saveUploads(task.id, fd, { staffId, field: "photo", imagesOnly: true });
  if (err) return { error: err };
  await log(task.id, staffId, "photo");
  if (!isDoneFor(task, staffId)) {
    const next = completeFor(task, staffId, new Date().toISOString());
    await teamStore.updateTask(next);
    await afterComplete(task, next, staffId);
  }
  done();
  return { ok: true };
}

export async function toggleMyChecklistItem(fd: FormData) {
  const mine = await myTask(fd);
  if (!mine) return;
  const { staffId, task } = mine;
  const itemId = String(fd.get("itemId") ?? "");
  const item = task.checklist.find((i) => i.id === itemId);
  if (!item || task.status === "done" || task.status === "review") return;
  await teamStore.updateTask(toggleChecklistItem(task, itemId, staffId, new Date().toISOString()));
  await log(task.id, staffId, item.doneAt ? "uncheck" : "check", item.text);
  done();
}

/** „Mám problém“: předvolený důvod jedním ťuknutím, nebo vlastní text. */
export async function reportProblem(fd: FormData) {
  const mine = await myTask(fd);
  if (!mine) return;
  const { staffId, task } = mine;
  const custom = String(fd.get("text") ?? "").trim().slice(0, 300);
  const reason = (custom || String(fd.get("reason") ?? "").trim()).slice(0, 300);
  if (!reason) return;
  const next = { ...task, problem: { staffId, reason, at: new Date().toISOString() } };
  await teamStore.updateTask(next);
  await log(task.id, staffId, "problem", reason);
  await notifyAdmin(next, "problem", staffId);
  done();
}

/** Zapnutí / vypnutí push notifikací na tomto zařízení. */
export async function savePush(token: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  const staffId = await staffForToken(token);
  if (!staffId || !sub?.endpoint?.startsWith("https://") || !sub.p256dh || !sub.auth) return false;
  await teamStore.savePushSub({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, staffId });
  return true;
}

export async function removePush(token: string, endpoint: string) {
  const staffId = await staffForToken(token);
  const sub = (await teamStore.listPushSubs()).find((s) => s.endpoint === endpoint);
  if (staffId && sub?.staffId === staffId) await teamStore.deletePushSub(endpoint);
}
