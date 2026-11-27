// Operace modulu Finance nad úložištěm: kategorie, nastavení, zaúčtování (číslování,
// převody pokladna ↔ účet), tržby z pokladny a import z banky.
import crypto from "node:crypto";
import { listOrders } from "@/lib/store";
import { pragueToday } from "@/lib/team/domain";
import { finStore } from "./store";
import { DEFAULT_CATEGORIES, nextNumber, parseFio, posCashByDay } from "./domain";
import type { BankTx, FinCategory, FinDoc, FinSettings } from "./types";

const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

/** Kategorie; při prvním použití se založí výchozí sada. */
export async function categories(): Promise<FinCategory[]> {
  let list = await finStore.list<FinCategory>("categories");
  if (list.length === 0) {
    list = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: newId(), sortOrder: i }));
    await finStore.putMany("categories", list);
  }
  return list.sort((a, b) => a.sortOrder - b.sortOrder);
}

const SETTINGS_ID = "main";
export async function settings(): Promise<FinSettings> {
  const s = await finStore.get<FinSettings & { id: string }>("settings", SETTINGS_ID);
  return { orgName: "", ico: "", opening: {}, fioLastFetchAt: null, fioLastDate: null, ...s };
}
export async function saveSettings(s: FinSettings) {
  await finStore.put("settings", { ...s, id: SETTINGS_ID });
}
export const openingFor = (s: FinSettings, year: string) => s.opening[year] ?? { cashHal: 0, bankHal: 0 };

export const docs = () => finStore.list<FinDoc>("docs");
export const bankTxs = () => finStore.list<BankTx>("bank");

export function blankDoc(input: Partial<FinDoc> & Pick<FinDoc, "direction" | "channel" | "amountHal">): FinDoc {
  const now = nowIso();
  return {
    id: newId(),
    number: null,
    status: "booked",
    date: null,
    issueDate: null,
    dueDate: null,
    categoryId: null,
    activity: "main",
    description: "",
    counterparty: null,
    ico: null,
    invoiceNumber: null,
    variableSymbol: null,
    note: null,
    source: "manual",
    sourceRef: null,
    bankTxId: null,
    pairDocId: null,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

/**
 * Uloží doklad. Zaúčtovaný doklad dostane číslo v řadě (PP/PV/BP/BV) a roce data úhrady;
 * při změně pokladna/banka, směru nebo roku se přečísluje. U převodu pokladna ↔ účet
 * se vytvoří / aktualizuje protidoklad.
 */
export async function saveDoc(doc: FinDoc, cats?: FinCategory[]): Promise<FinDoc> {
  const all = await docs();
  const others = all.filter((d) => d.id !== doc.id);
  let next = { ...doc, updatedAt: nowIso() };
  if (next.status === "booked" && next.date) {
    const year = next.date.slice(0, 4);
    const prefix = `${next.channel === "cash" ? "P" : "B"}${next.direction === "in" ? "P" : "V"}-${year}-`;
    if (!next.number?.startsWith(prefix)) next.number = nextNumber(others, next.direction, next.channel, year);
  } else {
    next.number = null;
  }

  const cat = (cats ?? (await categories())).find((c) => c.id === next.categoryId);
  if (cat?.transfer && next.status === "booked") {
    const list = cats ?? (await categories());
    const pairCat = list.find((c) => c.transfer && c.direction !== next.direction);
    const existing = next.pairDocId ? others.find((d) => d.id === next.pairDocId) : null;
    const pair = blankDoc({
      ...(existing ?? {}),
      id: existing?.id ?? newId(),
      direction: next.direction === "in" ? "out" : "in",
      channel: next.channel === "cash" ? "bank" : "cash",
      amountHal: next.amountHal,
      date: next.date,
      status: "booked",
      categoryId: pairCat?.id ?? null,
      activity: next.activity,
      description: next.description || "Převod pokladna ↔ účet",
      pairDocId: next.id,
      source: next.source,
      createdAt: existing?.createdAt ?? nowIso(),
    });
    const year = pair.date!.slice(0, 4);
    const prefix = `${pair.channel === "cash" ? "P" : "B"}${pair.direction === "in" ? "P" : "V"}-${year}-`;
    pair.number = existing?.number?.startsWith(prefix)
      ? existing.number
      : nextNumber([...others, next], pair.direction, pair.channel, year);
    next = { ...next, pairDocId: pair.id };
    await finStore.put("docs", pair);
  }
  await finStore.put("docs", next);
  return next;
}

/** Smaže doklad (i protidoklad převodu) a uvolní spárovaný bankovní pohyb. */
export async function deleteDoc(id: string) {
  const doc = await finStore.get<FinDoc>("docs", id);
  if (!doc) return;
  for (const d of [doc, doc.pairDocId ? await finStore.get<FinDoc>("docs", doc.pairDocId) : null]) {
    if (!d) continue;
    if (d.bankTxId) {
      const tx = await finStore.get<BankTx>("bank", d.bankTxId);
      if (tx) await finStore.put("bank", { ...tx, docId: null });
    }
    for (const f of (await finStore.listFiles()).filter((f) => f.docId === d.id)) await finStore.removeFile(f.id);
    await finStore.remove("docs", d.id);
  }
}

// --- Tržby z pokladny ------------------------------------------------------------

/** Dny s hotovostní tržbou, které ještě nejsou v deníku (bez dneška – den ještě běží). */
export async function pendingPosDays() {
  const [orders, all] = await Promise.all([listOrders({ from: new Date(Date.now() - 400 * 86400_000) }), docs()]);
  const booked = new Set(all.map((d) => d.sourceRef).filter(Boolean));
  const today = pragueToday();
  const byDay = posCashByDay(orders, (iso) => pragueToday(new Date(iso)));
  return [...byDay.entries()]
    .filter(([day, v]) => day < today && v.cashHal > 0 && !booked.has(`pos:${day}`))
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function bookPosDays(days: string[]) {
  const pending = await pendingPosDays();
  const cats = await categories();
  const cat = cats.find((c) => c.direction === "in" && c.row === "A01" && /hotov/i.test(c.name)) ?? cats.find((c) => c.row === "A01");
  let n = 0;
  for (const p of pending.filter((x) => days.includes(x.day))) {
    await saveDoc(
      blankDoc({
        direction: "in",
        channel: "cash",
        amountHal: p.cashHal,
        date: p.day,
        issueDate: p.day,
        categoryId: cat?.id ?? null,
        activity: cat?.activity ?? "side",
        description: `Tržba v hotovosti z pokladny (${p.count} účtenek)`,
        source: "pos",
        sourceRef: `pos:${p.day}`,
      }),
      cats,
    );
    n++;
  }
  return n;
}

// --- Banka (FIO API) ---------------------------------------------------------------

export const fioConfigured = () => Boolean(process.env.FIO_TOKEN?.trim());

/**
 * Stáhne pohyby z FIO za období (od posledního importu − 3 dny, poprvé 90 dní zpět).
 * FIO povoluje jeden dotaz na token za 30 s.
 */
export async function importFio(): Promise<{ added: number; error?: string }> {
  const token = process.env.FIO_TOKEN?.trim();
  if (!token) return { added: 0, error: "Není nastavený FIO_TOKEN." };
  const s = await settings();
  if (s.fioLastFetchAt && Date.now() - Date.parse(s.fioLastFetchAt) < 31_000) {
    return { added: 0, error: "FIO dovoluje stahovat jen jednou za 30 sekund. Zkuste to za chvíli." };
  }
  const today = pragueToday();
  const from = s.fioLastDate ? shiftDay(s.fioLastDate, -3) : shiftDay(today, -90);
  const url = `https://fioapi.fio.cz/v1/rest/periods/${encodeURIComponent(token)}/${from}/${today}/transactions.json`;
  await saveSettings({ ...s, fioLastFetchAt: nowIso() });
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return { added: 0, error: "Nepodařilo se spojit s FIO." };
  }
  if (res.status === 409) return { added: 0, error: "FIO: příliš častý dotaz, zkuste to za 30 s." };
  if (!res.ok) return { added: 0, error: `FIO vrátilo chybu ${res.status}. Zkontrolujte token.` };
  const txs = parseFio(await res.json(), nowIso());
  const existing = new Set((await bankTxs()).map((t) => t.id));
  const fresh = txs.filter((t) => !existing.has(t.id));
  await finStore.putMany("bank", fresh);
  await saveSettings({ ...(await settings()), fioLastDate: today });
  return { added: fresh.length };
}

function shiftDay(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
