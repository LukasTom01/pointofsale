// Kdy a komu poslat notifikaci: přiřazení, vrácení, problémy, připomínky před termínem,
// po termínu a ranní souhrn. Plánované notifikace hlídá `runReminders` (cron / průběžně).
import { after } from "next/server";
import { getStaff } from "@/lib/store";
import { teamStore } from "./store";
import { sendPush, pushConfigured } from "./push";
import { syncRoleTasks } from "./role-tasks";
import { dueInstant, formatRange, isDoneFor, pragueNow, reminderAt } from "./domain";
import { dueText } from "./format";
import type { Task } from "./types";

/** Odkazy notifikací: brigádník na svůj přehled (s tokenem), vedoucí do administrace. */
async function tokens(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const p of await teamStore.listProfiles()) if (p.token) out.set(p.staffId, p.token);
  return out;
}
const myUrl = (token: string, taskId?: string) => `/muj/${encodeURIComponent(token)}${taskId ? `#ukol-${taskId}` : ""}`;
const adminUrl = (taskId: string) => `/admin/ukoly#ukol-${taskId}`;

async function toStaff(staffIds: string[], make: (token: string) => { title: string; body: string; url: string; tag?: string }) {
  if (!pushConfigured() || staffIds.length === 0) return;
  const t = await tokens();
  await sendPush({ staffIds }, (staffId) => {
    const token = staffId ? t.get(staffId) : null;
    return token ? make(token) : null;
  });
}

const dueSuffix = (task: Task) => (task.dueDate ? ` · ${dueText(task.dueDate, task.dueTime, pragueNow().day)}` : "");

export async function notifyAssigned(tasks: Task[], staffIds: string[]) {
  if (tasks.length === 0) return;
  for (const id of staffIds) {
    const mine = tasks.filter((t) => t.assigneeIds.includes(id));
    if (mine.length === 0) continue;
    await toStaff([id], (token) =>
      mine.length === 1
        ? { title: "Nový úkol", body: `${mine[0].title}${dueSuffix(mine[0])}`, url: myUrl(token, mine[0].id), tag: `task-${mine[0].id}` }
        : { title: `Nové úkoly (${mine.length})`, body: mine.map((t) => t.title).join(", ").slice(0, 180), url: myUrl(token) },
    );
  }
}

export async function notifyReturned(task: Task, note: string | null) {
  await toStaff(task.assigneeIds, (token) => ({
    title: "Úkol vrácen k dopracování",
    body: `${task.title}${note ? ` – ${note}` : ""}`,
    url: myUrl(token, task.id),
    tag: `task-${task.id}`,
  }));
}

export async function notifyResolved(task: Task, staffId: string, note: string | null) {
  await toStaff([staffId], (token) => ({
    title: "Vedoucí reagoval/a na problém",
    body: `${task.title}${note ? ` – ${note}` : ""}`,
    url: myUrl(token, task.id),
    tag: `task-${task.id}`,
  }));
}

export async function notifyAdmin(task: Task, kind: "problem" | "review", staffId: string) {
  if (!pushConfigured()) return;
  const name = (await getStaff(staffId))?.name ?? "Někdo";
  const p =
    kind === "problem"
      ? { title: `⚠️ Problém: ${name}`, body: `${task.title} – ${task.problem?.reason ?? ""}` }
      : { title: `Ke kontrole: ${name}`, body: task.title };
  await sendPush({ admin: true }, { ...p, url: adminUrl(task.id), tag: `admin-${kind}-${task.id}` });
}

/** Neposílat zprávy, které měly odejít před víc než 3 h (např. po prvním zapnutí cronu). */
const STALE_MS = 3 * 3600 * 1000;

/**
 * Plánované notifikace. Každá se pošle jen jednou (klíč v team_notices);
 * změna termínu vytvoří nový klíč, takže připomínka přijde znovu.
 */
export async function runReminders(nowDate = new Date()) {
  await syncRoleTasks().catch((e) => console.error("syncRoleTasks", e));
  if (!pushConfigured()) return { sent: 0 };
  const now = nowDate.getTime();
  const [tasks, t] = await Promise.all([teamStore.listTasks(), tokens()]);
  let sent = 0;
  const once = async (key: string) => (await teamStore.claimNotice(key)) && ++sent > 0;

  for (const task of tasks) {
    if (task.status === "done" || task.status === "review" || task.assigneeIds.length === 0) continue;
    const dueKey = `${task.dueDate}T${task.dueTime ?? "day"}`;
    const waiting = task.assigneeIds.filter((id) => !isDoneFor(task, id) && t.has(id));
    const due = dueInstant(task);

    // Po termínu: brigádníkům, kdo ještě nemá hotovo, a vedoucímu.
    if (due && due.getTime() <= now && now - due.getTime() < STALE_MS) {
      if (await once(`overdue:${task.id}:${dueKey}`)) {
        await toStaff(waiting, (token) => ({
          title: "⏰ Úkol je po termínu",
          body: task.title,
          url: myUrl(token, task.id),
          tag: `task-${task.id}`,
        }));
        await sendPush({ admin: true }, { title: "Po termínu", body: task.title, url: adminUrl(task.id), tag: `admin-overdue-${task.id}` });
      }
      continue;
    }

    // Připomínka před termínem.
    const at = reminderAt(task);
    if (at && at.getTime() <= now && now - at.getTime() < STALE_MS && (!due || due.getTime() > now)) {
      if (await once(`remind:${task.id}:${dueKey}:${task.remindMin}`)) {
        await toStaff(waiting, (token) => ({
          title: "Připomínka úkolu",
          body: `${task.title}${dueSuffix(task)}`,
          url: myUrl(token, task.id),
          tag: `task-${task.id}`,
        }));
      }
    }
  }

  // Ranní souhrn (7:30–11:00): dnešní směna a úkoly na dnes.
  const pnow = pragueNow(nowDate);
  if (pnow.min >= 7 * 60 + 30 && pnow.min < 11 * 60) {
    const shifts = await teamStore.listShifts({ from: pnow.day, to: pnow.day });
    for (const [staffId, token] of t) {
      const mine = shifts.filter((s) => s.staffId === staffId);
      const todo = tasks.filter(
        (x) => x.assigneeIds.includes(staffId) && !isDoneFor(x, staffId) && x.status !== "review" && x.dueDate != null && x.dueDate <= pnow.day,
      );
      if (mine.length === 0 && todo.length === 0) continue;
      if (!(await once(`digest:${pnow.day}:${staffId}`))) continue;
      const parts = [
        mine.length ? `Směna ${mine.map((s) => formatRange(s.startMin, s.endMin)).join(", ")}` : null,
        todo.length ? `${todo.length} ${todo.length === 1 ? "úkol" : todo.length < 5 ? "úkoly" : "úkolů"} na dnes` : null,
      ].filter(Boolean);
      await sendPush({ staffIds: [staffId] }, { title: "Dobré ráno 👋", body: parts.join(" · "), url: myUrl(token), tag: `digest-${pnow.day}` });
    }
  }
  return { sent };
}

/**
 * Záložní spouštění připomínek bez cronu: po vykreslení stránky (pokladna, přehled, admin)
 * max jednou za minutu. Spolehlivější je externí cron na /api/cron (viz docs/tym.md).
 */
export function tickSoon() {
  try {
    after(async () => {
      try {
        if (await teamStore.claimNotice(`tick:${Math.floor(Date.now() / 60000)}`)) await runReminders();
      } catch (e) {
        console.error("reminder tick", e);
      }
    });
  } catch {
    // mimo request scope (skripty) – nic
  }
}
