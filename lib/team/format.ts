// Formátování dnů pro UI modulu Tým (český zápis, bez závislosti na zóně serveru).

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
