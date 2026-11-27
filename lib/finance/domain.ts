// Čistá logika modulu Finance (bez úložiště) – testy v domain.test.ts.
import type { Activity, BankTx, Channel, Direction, FinCategory, FinDoc, ReportRow } from "./types";

// --- Přehled o příjmech a výdajích (příloha č. 1 vyhlášky 325/2015 Sb.) -------

export const ROWS: { row: ReportRow; label: string; direction: Direction; passThrough?: boolean }[] = [
  { row: "A01", label: "Prodej zboží", direction: "in" },
  { row: "A02", label: "Prodej výrobků a služeb", direction: "in" },
  { row: "A03", label: "Příjmy z veřejných sbírek", direction: "in" },
  { row: "A04", label: "Přijaté peněžní dary mimo veřejné sbírky", direction: "in" },
  { row: "A05", label: "Přijaté členské příspěvky", direction: "in" },
  { row: "A06", label: "Dotace a příspěvky přijaté z veřejných rozpočtů", direction: "in" },
  { row: "A07", label: "Ostatní", direction: "in" },
  { row: "A08", label: "Průběžné položky", direction: "in", passThrough: true },
  { row: "A09", label: "Kursové rozdíly", direction: "in" },
  { row: "B01", label: "Dlouhodobý nehmotný a hmotný majetek", direction: "out" },
  { row: "B02", label: "Materiál", direction: "out" },
  { row: "B03", label: "Zboží", direction: "out" },
  { row: "B04", label: "Služby", direction: "out" },
  { row: "B05", label: "Mzdy", direction: "out" },
  { row: "B06", label: "Pojistné", direction: "out" },
  { row: "B07", label: "Ostatní osobní výdaje", direction: "out" },
  { row: "B08", label: "Ostatní", direction: "out" },
  { row: "B09", label: "Průběžné položky", direction: "out", passThrough: true },
  { row: "B10", label: "Kursové rozdíly", direction: "out" },
];
export const rowLabel = (row: ReportRow) => ROWS.find((r) => r.row === row)?.label ?? row;
const PASS = new Set(ROWS.filter((r) => r.passThrough).map((r) => r.row));

/** Výchozí kategorie pro spolek se stánkovým prodejem (lze upravit v nastavení). */
export const DEFAULT_CATEGORIES: Omit<FinCategory, "id" | "sortOrder">[] = [
  { name: "Tržby stánek – hotovost", direction: "in", row: "A01", activity: "side", transfer: false, active: true },
  { name: "Tržby stánek – karta", direction: "in", row: "A01", activity: "side", transfer: false, active: true },
  { name: "Členské příspěvky", direction: "in", row: "A05", activity: "main", transfer: false, active: true },
  { name: "Dary", direction: "in", row: "A04", activity: "main", transfer: false, active: true },
  { name: "Dotace", direction: "in", row: "A06", activity: "main", transfer: false, active: true },
  { name: "Ostatní příjmy", direction: "in", row: "A07", activity: "main", transfer: false, active: true },
  { name: "Převod pokladna ↔ účet", direction: "in", row: "A08", activity: "main", transfer: true, active: true },
  { name: "Zboží k prodeji", direction: "out", row: "B03", activity: "side", transfer: false, active: true },
  { name: "Materiál a vybavení", direction: "out", row: "B02", activity: "side", transfer: false, active: true },
  { name: "Služby (nájem, poplatky za místo, doprava)", direction: "out", row: "B04", activity: "side", transfer: false, active: true },
  { name: "Odměny brigádníkům (DPP)", direction: "out", row: "B05", activity: "side", transfer: false, active: true },
  { name: "Pojistné (sociální, zdravotní)", direction: "out", row: "B06", activity: "side", transfer: false, active: true },
  { name: "Bankovní a terminálové poplatky", direction: "out", row: "B08", activity: "side", transfer: false, active: true },
  { name: "Ostatní výdaje", direction: "out", row: "B08", activity: "main", transfer: false, active: true },
  { name: "Převod pokladna ↔ účet", direction: "out", row: "B09", activity: "main", transfer: true, active: true },
];

// --- Číslování dokladů --------------------------------------------------------

/** Řada dokladů: PP/PV = pokladna příjem/výdaj, BP/BV = banka příjem/výdaj. */
export function series(direction: Direction, channel: Channel): string {
  return `${channel === "cash" ? "P" : "B"}${direction === "in" ? "P" : "V"}`;
}

/** Další volné číslo v řadě a roce, např. PP-2026-0007. */
export function nextNumber(docs: Pick<FinDoc, "number">[], direction: Direction, channel: Channel, year: string): string {
  const prefix = `${series(direction, channel)}-${year}-`;
  let max = 0;
  for (const d of docs) {
    if (d.number?.startsWith(prefix)) max = Math.max(max, Number(d.number.slice(prefix.length)) || 0);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// --- Peněžní deník ------------------------------------------------------------

export interface LedgerRow {
  doc: FinDoc;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  cashBalance: number;
  bankBalance: number;
}

const byDate = (a: FinDoc, b: FinDoc) =>
  (a.date ?? "").localeCompare(b.date ?? "") || (a.number ?? "").localeCompare(b.number ?? "") || a.createdAt.localeCompare(b.createdAt);

/** Zaúčtované doklady roku v pořadí deníku s průběžnými zůstatky pokladny a účtu. */
export function ledger(docs: FinDoc[], year: string, opening: { cashHal: number; bankHal: number }): LedgerRow[] {
  let cash = opening.cashHal;
  let bank = opening.bankHal;
  return docs
    .filter((d) => d.status === "booked" && d.date?.startsWith(year))
    .sort(byDate)
    .map((doc) => {
      const sign = doc.direction === "in" ? 1 : -1;
      if (doc.channel === "cash") cash += sign * doc.amountHal;
      else bank += sign * doc.amountHal;
      return {
        doc,
        cashIn: doc.channel === "cash" && doc.direction === "in" ? doc.amountHal : 0,
        cashOut: doc.channel === "cash" && doc.direction === "out" ? doc.amountHal : 0,
        bankIn: doc.channel === "bank" && doc.direction === "in" ? doc.amountHal : 0,
        bankOut: doc.channel === "bank" && doc.direction === "out" ? doc.amountHal : 0,
        cashBalance: cash,
        bankBalance: bank,
      };
    });
}

/** Zůstatky ke konci roku (nebo k poslednímu zápisu). */
export function balances(docs: FinDoc[], year: string, opening: { cashHal: number; bankHal: number }) {
  const rows = ledger(docs, year, opening);
  const last = rows[rows.length - 1];
  return { cashHal: last?.cashBalance ?? opening.cashHal, bankHal: last?.bankBalance ?? opening.bankHal };
}

/** Dny, kdy by pokladna šla do minusu – v hotovosti nejde vydat víc, než v ní je. */
export function negativeCashDays(rows: LedgerRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) if (r.doc.channel === "cash" && r.cashBalance < 0 && r.doc.date) out.add(r.doc.date);
  return [...out];
}

// --- Přehled o příjmech a výdajích --------------------------------------------

export interface ReportLine {
  row: ReportRow;
  label: string;
  main: number;
  side: number;
}

/**
 * Součty po řádcích výkazu a činnostech. Celkové příjmy/výdaje jsou bez průběžných
 * položek (převody pokladna ↔ účet), rozdíl = příjmy − výdaje.
 */
export function incomeStatement(docs: FinDoc[], categories: FinCategory[], year: string) {
  const catRow = new Map(categories.map((c) => [c.id, c.row]));
  const sums = new Map<ReportRow, { main: number; side: number }>(ROWS.map((r) => [r.row, { main: 0, side: 0 }]));
  for (const d of docs) {
    if (d.status !== "booked" || !d.date?.startsWith(year)) continue;
    const row = (d.categoryId && catRow.get(d.categoryId)) || (d.direction === "in" ? "A07" : "B08");
    sums.get(row)![d.activity] += d.amountHal;
  }
  const lines: ReportLine[] = ROWS.map((r) => ({ row: r.row, label: r.label, ...sums.get(r.row)! }));
  const total = (dir: Direction, act: Activity) =>
    lines.filter((l) => l.row.startsWith(dir === "in" ? "A" : "B") && !PASS.has(l.row)).reduce((s, l) => s + l[act], 0);
  const income = { main: total("in", "main"), side: total("in", "side") };
  const expense = { main: total("out", "main"), side: total("out", "side") };
  return {
    lines,
    income,
    expense,
    result: { main: income.main - expense.main, side: income.side - expense.side },
  };
}

// --- Tržby z pokladny (POS) --------------------------------------------------

/**
 * Hotovostní tržby po dnech (jen zaplacené objednávky). Karty se do deníku
 * nezapisují z pokladny, ale až když peníze přijdou na účet (výpis z banky).
 */
export function posCashByDay(
  orders: { createdAt: string; paymentMethod: string; paymentStatus: string; totalHal: number }[],
  dayOf: (iso: string) => string,
): Map<string, { cashHal: number; count: number }> {
  const out = new Map<string, { cashHal: number; count: number }>();
  for (const o of orders) {
    if (o.paymentMethod !== "cash" || o.paymentStatus !== "paid") continue;
    const day = dayOf(o.createdAt);
    const row = out.get(day) ?? { cashHal: 0, count: 0 };
    row.cashHal += o.totalHal;
    row.count += 1;
    out.set(day, row);
  }
  return out;
}

// --- Banka (FIO) -------------------------------------------------------------

type FioCol = { value: string | number | null } | null | undefined;
type FioTx = Record<string, FioCol>;

/** Převod odpovědi FIO API (JSON) na pohyby. Datum "2026-11-20+0100" → "2026-11-20". */
export function parseFio(json: unknown, importedAt: string): BankTx[] {
  const list = (json as { accountStatement?: { transactionList?: { transaction?: FioTx[] } } })?.accountStatement?.transactionList
    ?.transaction;
  if (!Array.isArray(list)) return [];
  const v = (t: FioTx, n: number) => {
    const c = t[`column${n}`];
    return c && c.value != null && c.value !== "" ? c.value : null;
  };
  const s = (t: FioTx, n: number) => {
    const x = v(t, n);
    return x == null ? null : String(x).trim() || null;
  };
  return list
    .map((t): BankTx | null => {
      const id = s(t, 22);
      const date = s(t, 0)?.slice(0, 10);
      const amount = Number(v(t, 1));
      if (!id || !date || !Number.isFinite(amount)) return null;
      const acc = s(t, 2);
      const bank = s(t, 3);
      return {
        id,
        date,
        amountHal: Math.round(amount * 100),
        counterAccount: acc ? (bank ? `${acc}/${bank}` : acc) : null,
        counterName: s(t, 10) ?? s(t, 7),
        vs: s(t, 5),
        message: s(t, 16) ?? s(t, 7) ?? s(t, 25),
        type: s(t, 8),
        docId: null,
        ignored: false,
        importedAt,
      };
    })
    .filter((x): x is BankTx => x !== null);
}

/**
 * Kandidáti na spárování pohybu s nezaplaceným dokladem (faktura čeká na platbu):
 * stejný směr a částka; přednost má shoda VS, pak nejbližší datum.
 */
export function matchCandidates(tx: BankTx, docs: FinDoc[]): FinDoc[] {
  const dir: Direction = tx.amountHal >= 0 ? "in" : "out";
  const amount = Math.abs(tx.amountHal);
  const dist = (d: FinDoc) => Math.abs(Date.parse(tx.date) - Date.parse(d.dueDate ?? d.issueDate ?? tx.date));
  return docs
    .filter((d) => d.status === "unpaid" && d.direction === dir && d.amountHal === amount)
    .sort((a, b) => {
      const va = tx.vs && a.variableSymbol === tx.vs ? 0 : 1;
      const vb = tx.vs && b.variableSymbol === tx.vs ? 0 : 1;
      return va - vb || dist(a) - dist(b);
    });
}

/** Návrh kategorie podle dřívějších zaúčtování stejného protiúčtu / protistrany. */
export function suggestCategory(tx: BankTx, history: { tx: BankTx; categoryId: string | null }[]): string | null {
  const dir = tx.amountHal >= 0 ? 1 : -1;
  const same = history
    .filter((h) => h.categoryId && Math.sign(h.tx.amountHal) === dir)
    .filter(
      (h) =>
        (tx.counterAccount && h.tx.counterAccount === tx.counterAccount) ||
        (tx.counterName && h.tx.counterName?.toLowerCase() === tx.counterName.toLowerCase()),
    );
  const counts = new Map<string, number>();
  for (const h of same) counts.set(h.categoryId!, (counts.get(h.categoryId!) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Hospodářská činnost: příjmy − výdaje (podklad pro daň z příjmů spolku). */
export function sideActivityResult(statement: ReturnType<typeof incomeStatement>) {
  return statement.income.side - statement.expense.side;
}
