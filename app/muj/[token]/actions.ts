"use server";

// Akce osobního přehledu pracovníka. Oprávnění = platný osobní token
// a vlastnictví směny / přiřazení úkolu. Admin heslo se zde nevyžaduje.
import { revalidatePath } from "next/cache";
import { getStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { canCheckIn, canCheckOut, doneAtFor, pragueToday } from "@/lib/team/domain";

async function staffForToken(token: string) {
  if (!token || token.length < 16) return null;
  const profile = await teamStore.profileByToken(token);
  if (!profile) return null;
  return (await getStaff(profile.staffId)) ? profile.staffId : null;
}

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

export async function toggleMyTask(fd: FormData) {
  const staffId = await staffForToken(String(fd.get("token") ?? ""));
  const task = await teamStore.getTask(String(fd.get("taskId") ?? ""));
  if (!staffId || !task || !task.assigneeIds.includes(staffId)) return;
  const status = task.status === "done" ? "todo" : "done";
  await teamStore.updateTask({ ...task, status, doneAt: doneAtFor(status, task.doneAt, new Date().toISOString()) });
  done();
}
