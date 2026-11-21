// Čistá doménová logika modulu Tým (bez úložiště) – testy v domain.test.ts.
import type { Attendance, Task, TaskStatus } from "./types";

const TZ = process.env.REPORT_TZ || "Europe/Prague";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export const isDay = (value: string): boolean => DAY_RE.test(value);

// --- Úkoly -------------------------------------------------------------------

export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done"];
export const isTaskStatus = (v: string): v is TaskStatus => (TASK_STATUSES as string[]).includes(v);

/** „Teď“ v české zóně: den a minuta dne. */
export interface Now {
  day: string;
  min: number;
}

type DueFields = Pick<Task, "status" | "dueDate" | "dueTime">;

/**
 * Otevřený úkol po termínu. Bez času je celý den termínu ještě v pořádku;
 * s časem je po termínu od té minuty.
 */
export function isOverdue(task: DueFields, now: Now): boolean {
  if (task.status === "done" || task.dueDate == null) return false;
  if (task.dueDate < now.day) return true;
  return task.dueDate === now.day && task.dueTime != null && task.dueTime <= now.min;
}

/** Otevřený úkol, jehož termín přijde během `days` dní (dnes až dnes+days), a ještě není po termínu. */
export function isDueSoon(task: DueFields, now: Now, days = 3): boolean {
  if (task.status === "done" || task.dueDate == null || isOverdue(task, now)) return false;
  return task.dueDate <= addDays(now.day, days);
}

/** Pořadí: otevřené dřív než hotové; otevřené podle termínu a času (bez termínu/času na konec), hotové od nejnovějších. */
export function compareTasks(a: Task, b: Task): number {
  const doneA = a.status === "done";
  const doneB = b.status === "done";
  if (doneA !== doneB) return doneA ? 1 : -1;
  if (doneA) return (b.doneAt ?? "").localeCompare(a.doneAt ?? "");
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  const timeA = a.dueTime ?? 24 * 60;
  const timeB = b.dueTime ?? 24 * 60;
  if (timeA !== timeB) return timeA - timeB;
  return b.createdAt.localeCompare(a.createdAt);
}

/** doneAt sleduje stav: nastaví se při dokončení, smaže při znovuotevření. */
export function doneAtFor(status: TaskStatus, previous: string | null, nowIso: string): string | null {
  if (status !== "done") return null;
  return previous ?? nowIso;
}

// --- Časy směn ---------------------------------------------------------------

/** "8:00" / "08:00" / "24:00" → minuty; null když neplatné. */
export function parseTime(value: string): number | null {
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "08:00" pro <input type="time"> */
export function timeInput(minutes: number): string {
  return formatTime(minutes).padStart(5, "0");
}

export const formatRange = (startMin: number, endMin: number): string =>
  `${formatTime(startMin)}–${formatTime(endMin)}`;

/** Platná směna: začátek před koncem, v rámci jednoho dne (bez nočních směn). */
export function parseShiftTimes(from: string, to: string): { startMin: number; endMin: number } | null {
  const startMin = parseTime(from);
  const endMin = parseTime(to);
  if (startMin == null || endMin == null || startMin >= endMin || startMin >= 1440) return null;
  return { startMin, endMin };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Pondělí týdne, ve kterém leží `day`. */
export function weekStart(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** Sloupce plánu: dny akce (max 14), jinak 7 dní týdne. */
export function planDays(input: { eventFrom?: string | null; eventTo?: string | null; weekOf: string }): string[] {
  if (input.eventFrom) {
    const end = input.eventTo && input.eventTo >= input.eventFrom ? input.eventTo : input.eventFrom;
    const days: string[] = [];
    for (let d = input.eventFrom; d <= end && days.length < 14; d = addDays(d, 1)) days.push(d);
    return days;
  }
  const start = weekStart(input.weekOf);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

type Slot = { id: string; staffId: string; day: string; startMin: number; endMin: number };

/** Id směn, které se u stejného člověka ve stejný den překrývají. */
export function overlappingShiftIds(shifts: Slot[]): Set<string> {
  const out = new Set<string>();
  const groups = new Map<string, Slot[]>();
  for (const s of shifts) {
    const key = `${s.staffId}|${s.day}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const list of groups.values()) {
    const sorted = list.slice().sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].startMin < sorted[i].endMin; j++) {
        out.add(sorted[i].id);
        out.add(sorted[j].id);
      }
    }
  }
  return out;
}

/** Nejčastější časy směn pro rychlé tlačítko v plánu. */
export function quickTimes(shifts: { startMin: number; endMin: number }[], limit = 4) {
  const counts = new Map<string, { startMin: number; endMin: number; n: number }>();
  for (const s of shifts) {
    const key = `${s.startMin}-${s.endMin}`;
    const row = counts.get(key) ?? { startMin: s.startMin, endMin: s.endMin, n: 0 };
    row.n += 1;
    counts.set(key, row);
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.startMin - b.startMin)
    .slice(0, limit)
    .map(({ startMin, endMin }) => ({ startMin, endMin }));
}

/** Kolik lidí má každá pozice v každé hodině dne: roleId → počty[0..23]. */
export function coverageByHour(shifts: { roleId: string | null; startMin: number; endMin: number }[]) {
  const out = new Map<string | null, number[]>();
  for (const s of shifts) {
    const row = out.get(s.roleId) ?? Array.from({ length: 24 }, () => 0);
    for (let h = 0; h < 24; h++) {
      if (s.startMin < (h + 1) * 60 && s.endMin > h * 60) row[h] += 1;
    }
    out.set(s.roleId, row);
  }
  return out;
}

/** Cíle kopírování směny: každá dvojice (člověk, den) kromě originálu. */
export function copyTargets(source: { staffId: string; day: string }, staffIds: string[], days: string[]) {
  const people = [...new Set(staffIds)];
  const targetDays = [...new Set(days)].filter(isDay);
  const out: { staffId: string; day: string }[] = [];
  for (const staffId of people.length ? people : [source.staffId]) {
    for (const day of targetDays.length ? targetDays : [source.day]) {
      if (staffId === source.staffId && day === source.day) continue;
      out.push({ staffId, day });
    }
  }
  return out;
}

// --- Docházka ----------------------------------------------------------------

/** Dnešek v české zóně, "YYYY-MM-DD". */
export function pragueToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Aktuální den a minuta dne v české zóně. */
export function pragueNow(now = new Date()): Now {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { day: pragueToday(now), min: Number(p.hour) * 60 + Number(p.minute) };
}

/** Skutečný okamžik pro český čas `minutes` v den `day` (bezpečné přes změnu času). */
export function pragueInstant(day: string, minutes: number): Date {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 0, minutes);
  const offset = (at: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(at))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - at;
  };
  let at = guess - offset(guess);
  at = guess - offset(at);
  return new Date(at);
}

/** "8:05" – čas okamžiku v české zóně. */
export function pragueClock(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Odpracované minuty – jen když je znám příchod i odchod. */
export function actualMinutes(checkInAt: string | null, checkOutAt: string | null): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const diff = Math.round((Date.parse(checkOutAt) - Date.parse(checkInAt)) / 60000);
  return diff > 0 ? diff : null;
}

export interface AttendanceTotals {
  staffId: string;
  shifts: number;
  plannedMin: number;
  actualMin: number;
  absent: number;
}

/** Součty po lidech pro souhrn a výkaz. */
export function attendanceTotals(
  shifts: {
    staffId: string;
    startMin: number;
    endMin: number;
    attendance: Attendance;
    checkInAt: string | null;
    checkOutAt: string | null;
  }[],
): Map<string, AttendanceTotals> {
  const out = new Map<string, AttendanceTotals>();
  for (const s of shifts) {
    const row = out.get(s.staffId) ?? { staffId: s.staffId, shifts: 0, plannedMin: 0, actualMin: 0, absent: 0 };
    row.shifts += 1;
    row.plannedMin += s.endMin - s.startMin;
    if (s.attendance === "absent") row.absent += 1;
    else row.actualMin += actualMinutes(s.checkInAt, s.checkOutAt) ?? 0;
    out.set(s.staffId, row);
  }
  return out;
}

/** Hodiny na jedno desetinné místo (90 min → 1,5). */
export const toHours = (minutes: number): number => Math.round((minutes / 60) * 10) / 10;

export const canCheckIn = (s: { day: string; checkInAt: string | null }, today: string): boolean =>
  s.day === today && !s.checkInAt;
export const canCheckOut = (s: { checkInAt: string | null; checkOutAt: string | null }): boolean =>
  Boolean(s.checkInAt) && !s.checkOutAt;

/** Období souhrnu: dny akce, jinak ?od..do (výchozí tento měsíc). */
export function reportPeriod(
  sp: { od?: string; do?: string },
  today: string,
  event: { dateFrom: string | null; dateTo: string | null } | null,
): { from: string; to: string } {
  const valid = (v?: string) => (v && isDay(v) ? v : null);
  if (event?.dateFrom && !valid(sp.od) && !valid(sp.do)) {
    return { from: event.dateFrom, to: event.dateTo ?? event.dateFrom };
  }
  const from = valid(sp.od) ?? `${today.slice(0, 7)}-01`;
  const to = valid(sp.do) ?? today;
  return from <= to ? { from, to } : { from: to, to: from };
}
