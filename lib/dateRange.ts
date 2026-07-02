// Rozsah dní pro přehledy/export. Dny se interpretují v české časové zóně
// (Europe/Prague), i když server běží v UTC (Vercel) – aby prodeje kolem
// půlnoci padaly do správného dne. Objednávky mají createdAt v UTC (ISO).

const TZ = process.env.REPORT_TZ || "Europe/Prague";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Dnešní datum v české zóně jako "YYYY-MM-DD".
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Posun offsetu zóny (ms) v daném okamžiku: local(TZ) − UTC.
function tzOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  const hour = m.hour === "24" ? "0" : m.hour;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +hour, +m.minute, +m.second);
  return asUTC - instant.getTime();
}

// Okamžik (UTC) odpovídající půlnoci daného dne v české zóně.
function dayStartUtc(dayStr: string): Date {
  const guess = Date.parse(`${dayStr}T00:00:00Z`);
  const off = tzOffsetMs(new Date(guess));
  return new Date(guess - off);
}

// Přičte dny k datu "YYYY-MM-DD" (kalendářní matematika v UTC).
function addDaysStr(dayStr: string, n: number): string {
  const [y, mo, d] = dayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) + n * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function monthFirst(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export interface ResolvedRange {
  fromStr: string;
  toStr: string;
  from: Date;
  to: Date; // exkluzivní horní hranice (den "toStr" včetně)
}

export function resolveRange(fromParam?: string, toParam?: string): ResolvedRange {
  const fromStr = fromParam && DAY_RE.test(fromParam) ? fromParam : todayStr();
  let toStr = toParam && DAY_RE.test(toParam) ? toParam : fromStr;
  if (toStr < fromStr) toStr = fromStr;
  return {
    fromStr,
    toStr,
    from: dayStartUtc(fromStr),
    to: dayStartUtc(addDaysStr(toStr, 1)),
  };
}

export interface Preset {
  key: string;
  label: string;
  from: string;
  to: string;
}

// Rychlé přednastavené rozsahy (počítané v české zóně).
export function presets(): Preset[] {
  const today = todayStr();
  const [y, m, d] = today.split("-").map(Number);

  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = neděle
  const mondayOffset = (weekday + 6) % 7;
  const weekFrom = addDaysStr(today, -mondayOffset);

  const thisMonthFirst = monthFirst(y, m);
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  const prevMonthFirst = monthFirst(py, pm);
  const prevMonthLast = addDaysStr(thisMonthFirst, -1);

  return [
    { key: "today", label: "Dnes", from: today, to: today },
    { key: "week", label: "Tento týden", from: weekFrom, to: today },
    { key: "month", label: "Tento měsíc", from: thisMonthFirst, to: today },
    { key: "prevMonth", label: "Minulý měsíc", from: prevMonthFirst, to: prevMonthLast },
    { key: "all", label: "Vše", from: "2000-01-01", to: today },
  ];
}
