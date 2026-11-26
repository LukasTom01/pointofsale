// Modul Finance: jednoduché účetnictví spolku (zákon č. 563/1991 Sb., vyhláška č. 325/2015 Sb.).
// Základ je peněžní deník: každý příjem a výdej v hotovosti (pokladna) a na účtu (banka).
// Částky v haléřích (celá čísla), data "YYYY-MM-DD".

export type Direction = "in" | "out";
/** cash = pokladna (hotovost), bank = bankovní účet. */
export type Channel = "cash" | "bank";
/** main = hlavní (nezisková) činnost, side = hospodářská (vedlejší) činnost. */
export type Activity = "main" | "side";

/** Řádek přehledu o příjmech a výdajích (příloha č. 1 vyhl. 325/2015 Sb.). */
export type ReportRow =
  | "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08" | "A09"
  | "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08" | "B09" | "B10";

export interface FinCategory {
  id: string;
  name: string;
  direction: Direction;
  row: ReportRow;
  /** Výchozí činnost pro nové doklady v této kategorii. */
  activity: Activity;
  /** Převod mezi pokladnou a účtem (průběžná položka) – vytvoří se i protidoklad. */
  transfer: boolean;
  active: boolean;
  sortOrder: number;
}

/**
 * draft  = nahraný doklad, čeká na potvrzení (z fotky / PDF),
 * unpaid = potvrzený, ale ještě nezaplacený (kniha závazků / pohledávek),
 * booked = zaplaceno – je v peněžním deníku.
 */
export type DocStatus = "draft" | "unpaid" | "booked";
export type DocSource = "manual" | "pos" | "bank" | "upload";

export interface FinDoc {
  id: string;
  /** Číslo dokladu v deníku, např. PP-2026-0001 (přidělí se při zaúčtování). */
  number: string | null;
  status: DocStatus;
  direction: Direction;
  channel: Channel;
  amountHal: number; // vždy kladné
  /** Datum úhrady = datum zápisu v peněžním deníku (null u nezaplacených). */
  date: string | null;
  /** Datum vystavení dokladu (faktury, účtenky). */
  issueDate: string | null;
  dueDate: string | null;
  categoryId: string | null;
  activity: Activity;
  description: string;
  counterparty: string | null;
  ico: string | null;
  invoiceNumber: string | null;
  variableSymbol: string | null;
  note: string | null;
  source: DocSource;
  /** Původ: "pos:2026-11-21", "fio:123456" … (zabrání duplicitám). */
  sourceRef: string | null;
  bankTxId: string | null;
  /** Druhá polovina převodu pokladna ↔ banka. */
  pairDocId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Pohyb na bankovním účtu (import z FIO). */
export interface BankTx {
  id: string; // ID pohybu ve FIO
  date: string;
  amountHal: number; // + příjem, − výdej
  counterAccount: string | null;
  counterName: string | null;
  vs: string | null;
  message: string | null;
  type: string | null;
  docId: string | null;
  ignored: boolean;
  importedAt: string;
}

export interface FinSettings {
  orgName: string;
  ico: string;
  /** Počáteční stavy k 1. 1. daného roku (haléře). */
  opening: Record<string, { cashHal: number; bankHal: number }>;
  /** Kdy naposledy proběhl import z FIO (kvůli limitu 1× za 30 s). */
  fioLastFetchAt: string | null;
  fioLastDate: string | null;
}

export interface FinFile {
  id: string;
  docId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}
