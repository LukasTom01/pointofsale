// Rozsah dní pro přehledy/export. Vstup jsou řetězce "YYYY-MM-DD" (lokální dny),
// výstup jsou hranice pro filtrování objednávek (to = půlnoc po posledním dni).

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ResolvedRange {
  fromStr: string;
  toStr: string;
  from: Date;
  to: Date; // exkluzivní horní hranice (den "toStr" včetně)
}

export function resolveRange(fromParam?: string, toParam?: string): ResolvedRange {
  const fromStr = fromParam && DAY_RE.test(fromParam) ? fromParam : todayStr();
  let toStr = toParam && DAY_RE.test(toParam) ? toParam : fromStr;
  // Kdyby bylo "do" před "od", srovnej na jeden den.
  if (toStr < fromStr) toStr = fromStr;
  const from = new Date(`${fromStr}T00:00:00`);
  const toDay = new Date(`${toStr}T00:00:00`);
  const to = new Date(toDay.getTime() + 24 * 60 * 60 * 1000);
  return { fromStr, toStr, from, to };
}
