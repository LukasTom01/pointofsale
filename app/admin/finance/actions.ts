"use server";

// Akce modulu Finance (jen pro přihlášenou administraci).
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminServer";
import { kcToHal } from "@/lib/money";
import { isDay } from "@/lib/team/domain";
import { finStore } from "@/lib/finance/store";
import { extractDoc } from "@/lib/finance/ai";
import { matchCandidates } from "@/lib/finance/domain";
import {
  blankDoc,
  bookPosDays,
  categories,
  deleteDoc,
  importFio,
  newId,
  saveDoc,
  saveSettings,
  settings,
} from "@/lib/finance/service";
import type { Activity, BankTx, FinCategory, FinDoc, ReportRow } from "@/lib/finance/types";

export type FormState = { ok?: string; error?: string } | undefined;

const refresh = () => revalidatePath("/admin/finance", "layout");
const text = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);
const opt = (fd: FormData, k: string, max = 300) => text(fd, k, max) || null;
const day = (fd: FormData, k: string) => (isDay(text(fd, k)) ? text(fd, k) : null);
const MAX_UPLOAD = 4 * 1024 * 1024;

async function saveFiles(docId: string, fd: FormData, field = "attachment"): Promise<string | null> {
  const files = fd.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD) return "Soubory jsou moc velké – najednou max 4 MB.";
  for (const f of files) {
    await finStore.addFile(
      { docId, name: f.name.replace(/[\\/\u0000-\u001f"]/g, "_").slice(0, 150) || "doklad", mime: f.type || "application/octet-stream", size: f.size },
      Buffer.from(await f.arrayBuffer()),
    );
  }
  return null;
}

/**
 * Doklad z formuláře. Kategorie určuje příjem/výdaj; „Zaplaceno“ určuje pokladnu,
 * účet, nebo nezaplacený doklad (kniha závazků a pohledávek).
 */
function readDoc(fd: FormData, base: FinDoc | null, cats: FinCategory[]): FinDoc | string {
  const cat = cats.find((c) => c.id === text(fd, "categoryId"));
  if (!cat) return "Vyberte kategorii.";
  const amount = kcToHal(text(fd, "amount"));
  if (amount == null || amount <= 0) return "Zadejte částku větší než 0.";
  const paid = text(fd, "paid"); // cash | bank | unpaid
  const date = day(fd, "date");
  if (paid !== "unpaid" && !date) return "Zadejte datum úhrady.";
  const activity: Activity = text(fd, "activity") === "side" ? "side" : text(fd, "activity") === "main" ? "main" : cat.activity;
  const fields = {
    direction: cat.direction,
    channel: paid === "cash" ? ("cash" as const) : ("bank" as const),
    amountHal: amount,
    status: paid === "unpaid" ? ("unpaid" as const) : ("booked" as const),
    date: paid === "unpaid" ? null : date,
    issueDate: day(fd, "issueDate") ?? date,
    dueDate: day(fd, "dueDate"),
    categoryId: cat.id,
    activity,
    description: text(fd, "description", 200) || cat.name,
    counterparty: opt(fd, "counterparty", 120),
    ico: opt(fd, "ico", 12),
    invoiceNumber: opt(fd, "invoiceNumber", 40),
    variableSymbol: opt(fd, "variableSymbol", 10),
    note: opt(fd, "note", 1000),
  };
  return base ? { ...base, ...fields } : blankDoc(fields);
}

export async function saveDocAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const cats = await categories();
  const id = text(fd, "docId");
  const base = id ? await finStore.get<FinDoc>("docs", id) : null;
  if (id && !base) return { error: "Doklad nenalezen." };
  const doc = readDoc(fd, base, cats);
  if (typeof doc === "string") return { error: doc };
  if (base?.bankTxId && (doc.channel !== "bank" || doc.status !== "booked")) {
    return { error: "Doklad je spárovaný s pohybem na účtu – musí zůstat „z účtu“. Nejdřív zrušte párování." };
  }
  const saved = await saveDoc(doc, cats);
  const err = await saveFiles(saved.id, fd);
  refresh();
  if (err) return { error: `Uloženo, ale přílohy ne: ${err}` };
  return { ok: saved.number ? `Uloženo jako ${saved.number}.` : "Uloženo (čeká na zaplacení)." };
}

export async function deleteDocAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  await deleteDoc(text(fd, "docId"));
  refresh();
  return { ok: "Smazáno." };
}

export async function deleteFileAction(fd: FormData) {
  await requireAdmin();
  await finStore.removeFile(text(fd, "fileId"));
  refresh();
}

/**
 * Nahrání fotek / PDF dokladů: každý soubor = koncept dokladu. Údaje z něj přečte AI,
 * vy je jen zkontrolujete a potvrdíte.
 */
export async function uploadDocs(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Vyberte fotku nebo PDF." };
  if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD) return { error: "Najednou max 4 MB – nahrajte doklady po menších dávkách." };
  const cats = (await categories()).filter((c) => c.active && !c.transfer);
  let read = 0;
  const errors = new Set<string>();
  await Promise.all(
    files.map(async (f) => {
      const data = Buffer.from(await f.arrayBuffer());
      const doc = blankDoc({ direction: "out", channel: "bank", amountHal: 0, status: "draft", source: "upload", description: "" });
      const ai = await extractDoc({ data, mime: f.type }, cats);
      if ("ok" in ai) {
        const x = ai.ok;
        const cat = cats.find((c) => c.id === x.categoryId && c.direction === x.direction);
        Object.assign(doc, {
          direction: x.direction,
          channel: x.paidInCash ? "cash" : "bank",
          amountHal: Math.max(0, Math.round(x.amountKc * 100)),
          issueDate: x.issueDate && isDay(x.issueDate) ? x.issueDate : null,
          dueDate: x.dueDate && isDay(x.dueDate) ? x.dueDate : null,
          date: x.paidInCash && x.issueDate && isDay(x.issueDate) ? x.issueDate : null,
          counterparty: x.counterparty,
          ico: x.ico,
          invoiceNumber: x.invoiceNumber,
          variableSymbol: x.variableSymbol,
          description: x.description.slice(0, 200),
          categoryId: cat?.id ?? null,
          activity: cat?.activity ?? "main",
        } satisfies Partial<FinDoc>);
        read++;
      } else errors.add(ai.error);
      await finStore.put("docs", doc);
      await finStore.addFile({ docId: doc.id, name: f.name.slice(0, 150) || "doklad", mime: f.type || "application/octet-stream", size: f.size }, data);
    }),
  );
  refresh();
  const msg = `Nahráno ${files.length} dokladů${read ? `, přečteno ${read}` : ""}. Zkontrolujte je a potvrďte níže.`;
  return errors.size ? { error: `${msg} ${[...errors].join(" ")}` } : { ok: msg };
}

// --- Tržby z pokladny ---------------------------------------------------------------

export async function bookPos(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const n = await bookPosDays(fd.getAll("day").map(String));
  refresh();
  return { ok: n ? `Zaúčtováno ${n} dnů tržeb.` : "Nebylo co zaúčtovat." };
}

// --- Banka -----------------------------------------------------------------------------

export async function fioImportAction(_prev: FormState): Promise<FormState> {
  await requireAdmin();
  const r = await importFio();
  refresh();
  if (r.error) return { error: r.error };
  return { ok: r.added ? `Staženo ${r.added} nových pohybů.` : "Žádné nové pohyby." };
}

/** Pohyb na účtu → nový doklad v deníku (kategorie, činnost, popis). */
export async function bankBook(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const tx = await finStore.get<BankTx>("bank", text(fd, "txId"));
  if (!tx || tx.docId) return { error: "Pohyb už je zaúčtovaný." };
  const cats = await categories();
  const cat = cats.find((c) => c.id === text(fd, "categoryId"));
  const direction = tx.amountHal >= 0 ? "in" : "out";
  if (!cat || cat.direction !== direction) return { error: `Vyberte kategorii ${direction === "in" ? "příjmu" : "výdaje"}.` };
  const doc = await saveDoc(
    blankDoc({
      direction,
      channel: "bank",
      amountHal: Math.abs(tx.amountHal),
      date: tx.date,
      issueDate: tx.date,
      categoryId: cat.id,
      activity: text(fd, "activity") === "main" ? "main" : text(fd, "activity") === "side" ? "side" : cat.activity,
      description: text(fd, "description", 200) || tx.message || tx.counterName || cat.name,
      counterparty: tx.counterName,
      variableSymbol: tx.vs,
      source: "bank",
      sourceRef: `fio:${tx.id}`,
      bankTxId: tx.id,
    }),
    cats,
  );
  await finStore.put("bank", { ...tx, docId: doc.id });
  refresh();
  return { ok: `Zaúčtováno jako ${doc.number}.` };
}

/** Pohyb na účtu = úhrada dříve nahrané faktury: doklad se zaúčtuje k datu platby. */
export async function bankPair(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const tx = await finStore.get<BankTx>("bank", text(fd, "txId"));
  const doc = await finStore.get<FinDoc>("docs", text(fd, "docId"));
  if (!tx || tx.docId) return { error: "Pohyb už je zaúčtovaný." };
  if (!doc || doc.status !== "unpaid") return { error: "Doklad nenalezen nebo už je zaplacený." };
  if (!matchCandidates(tx, [doc]).length) return { error: "Částka nebo směr nesedí." };
  const saved = await saveDoc({ ...doc, status: "booked", channel: "bank", date: tx.date, bankTxId: tx.id, sourceRef: doc.sourceRef ?? `fio:${tx.id}` });
  await finStore.put("bank", { ...tx, docId: saved.id });
  refresh();
  return { ok: `Spárováno, zaúčtováno jako ${saved.number}.` };
}

export async function bankIgnore(fd: FormData) {
  await requireAdmin();
  const tx = await finStore.get<BankTx>("bank", text(fd, "txId"));
  if (tx && !tx.docId) await finStore.put("bank", { ...tx, ignored: !tx.ignored });
  refresh();
}

// --- Nastavení -----------------------------------------------------------------------------

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const s = await settings();
  const year = text(fd, "year");
  const next = { ...s, orgName: text(fd, "orgName", 120), ico: text(fd, "ico", 12) };
  if (/^\d{4}$/.test(year)) {
    const cash = kcToHal(text(fd, "openingCash") || "0");
    const bank = kcToHal(text(fd, "openingBank") || "0");
    if (cash == null || bank == null) return { error: "Počáteční stavy zadejte jako částky." };
    next.opening = { ...s.opening, [year]: { cashHal: cash, bankHal: bank } };
  }
  await saveSettings(next);
  refresh();
  return { ok: "Uloženo." };
}

const ROW_RE = /^(A0[1-9]|B(0[1-9]|10))$/;

export async function saveCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const cats = await categories();
  const name = text(fd, "name", 80);
  const row = text(fd, "row");
  if (!name || !ROW_RE.test(row)) return { error: "Zadejte název a řádek výkazu." };
  const id = text(fd, "categoryId");
  const base = id ? cats.find((c) => c.id === id) : null;
  const cat: FinCategory = {
    id: base?.id ?? newId(),
    name,
    row: row as ReportRow,
    direction: row.startsWith("A") ? "in" : "out",
    activity: text(fd, "activity") === "side" ? "side" : "main",
    transfer: base?.transfer ?? false,
    active: fd.get("active") != null || !base,
    sortOrder: base?.sortOrder ?? cats.length,
  };
  await finStore.put("categories", cat);
  refresh();
  return { ok: "Uloženo." };
}
