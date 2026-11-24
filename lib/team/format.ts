// Formátování dnů pro UI modulu Tým (český zápis, bez závislosti na zóně serveru).
import { addDays, formatTime } from "./domain";

const at = (day: string) => new Date(`${day}T12:00:00Z`);

/** "po 24. 11." */
export function dayLabel(day: string): string {
  const d = at(day);
  const wd = new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "UTC" }).format(d);
  return `${wd} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** "pondělí 24. listopadu" */
export function dayLong(day: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(at(day));
}

/** "24. 11. 2026" */
export function dayShort(day: string): string {
  const d = at(day);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
}

export const hoursText = (minutes: number): string =>
  `${(Math.round((minutes / 60) * 10) / 10).toLocaleString("cs-CZ")} h`;

/** Termín úkolu: „dnes 14:00“, „zítra“, „st 26. 11. 9:30“, u vzdálenějších i rok. */
export function dueText(dueDate: string, dueTime: number | null, today: string): string {
  const day =
    dueDate === today
      ? "dnes"
      : dueDate === addDays(today, 1)
        ? "zítra"
        : dueDate === addDays(today, -1)
          ? "včera"
          : dueDate.slice(0, 4) === today.slice(0, 4)
            ? dayLabel(dueDate)
            : dayShort(dueDate);
  return dueTime == null ? day : `${day} ${formatTime(dueTime)}`;
}

/** Termín úkolu pozice: „Na začátku směny“, „30 min po začátku směny“, „1 h před koncem směny“. */
export function whenText(t: { anchor: "start" | "end"; offsetMin: number }): string {
  const edge = t.anchor === "end" ? "konci" : "začátku";
  if (t.offsetMin === 0) return `Na ${edge} směny`;
  const abs = Math.abs(t.offsetMin);
  const len = abs % 60 === 0 ? `${abs / 60} h` : abs > 60 ? `${formatTime(abs)} h` : `${abs} min`;
  return t.offsetMin < 0 ? `${len} před ${t.anchor === "end" ? "koncem" : "začátkem"} směny` : `${len} po ${edge} směny`;
}
