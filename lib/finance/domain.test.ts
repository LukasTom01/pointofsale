// Testy logiky modulu Finance: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORIES,
  balances,
  incomeStatement,
  ledger,
  matchCandidates,
  negativeCashDays,
  nextNumber,
  parseFio,
  posCashByDay,
  suggestCategory,
} from "./domain.ts";
import type { BankTx, FinCategory, FinDoc } from "./types.ts";

const cats: FinCategory[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `c${i}`, sortOrder: i }));
const cat = (name: string, dir: "in" | "out") => cats.find((c) => c.name.startsWith(name) && c.direction === dir)!.id;

let n = 0;
const doc = (o: Partial<FinDoc>): FinDoc => ({
  id: `d${++n}`, number: null, status: "booked", direction: "in", channel: "cash", amountHal: 100, date: "2026-05-01",
  issueDate: null, dueDate: null, categoryId: null, activity: "main", description: "", counterparty: null, ico: null,
  invoiceNumber: null, variableSymbol: null, note: null, source: "manual", sourceRef: null, bankTxId: null, pairDocId: null,
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`, updatedAt: "", ...o,
});
const tx = (o: Partial<BankTx>): BankTx => ({
  id: "t1", date: "2026-05-10", amountHal: -12100, counterAccount: "123/0800", counterName: "Makro", vs: null, message: null,
  type: null, docId: null, ignored: false, importedAt: "", ...o,
});

test("numbering per series and year", () => {
  const docs = [{ number: "PP-2026-0001" }, { number: "PP-2026-0009" }, { number: "PV-2026-0003" }, { number: "PP-2025-0044" }];
  assert.equal(nextNumber(docs, "in", "cash", "2026"), "PP-2026-0010");
  assert.equal(nextNumber(docs, "out", "bank", "2026"), "BV-2026-0001");
  assert.equal(nextNumber(docs, "in", "cash", "2027"), "PP-2027-0001");
});

test("ledger balances, year filter, negative cash", () => {
  const docs = [
    doc({ date: "2026-03-02", direction: "out", channel: "cash", amountHal: 50000 }),
    doc({ date: "2026-03-01", direction: "in", channel: "cash", amountHal: 30000 }),
    doc({ date: "2026-03-05", direction: "in", channel: "bank", amountHal: 70000 }),
    doc({ date: "2025-12-31", direction: "in", channel: "cash", amountHal: 999 }),
    doc({ date: null, status: "unpaid", amountHal: 5 }),
  ];
  const rows = ledger(docs, "2026", { cashHal: 10000, bankHal: 0 });
  assert.deepEqual(rows.map((r) => [r.cashBalance, r.bankBalance]), [[40000, 0], [-10000, 0], [-10000, 70000]]);
  assert.deepEqual(negativeCashDays(rows), ["2026-03-02"]);
  assert.deepEqual(balances(docs, "2026", { cashHal: 10000, bankHal: 0 }), { cashHal: -10000, bankHal: 70000 });
});

test("income statement by row and activity, transfers excluded from totals", () => {
  const docs = [
    doc({ categoryId: cat("Tržby stánek – hotovost", "in"), activity: "side", amountHal: 100000 }),
    doc({ categoryId: cat("Dary", "in"), amountHal: 20000 }),
    doc({ categoryId: cat("Zboží", "out"), direction: "out", activity: "side", amountHal: 40000 }),
    doc({ categoryId: cat("Převod", "out"), direction: "out", amountHal: 50000 }),
    doc({ categoryId: cat("Převod", "in"), channel: "bank", amountHal: 50000 }),
    doc({ categoryId: null, direction: "out", amountHal: 300 }),
    doc({ categoryId: cat("Dary", "in"), amountHal: 777, status: "unpaid", date: null }),
  ];
  const st = incomeStatement(docs, cats, "2026");
  assert.deepEqual(st.income, { main: 20000, side: 100000 });
  assert.deepEqual(st.expense, { main: 300, side: 40000 });
  assert.deepEqual(st.result, { main: 19700, side: 60000 });
  assert.equal(st.lines.find((l) => l.row === "A08")!.main, 50000);
  assert.equal(st.lines.find((l) => l.row === "B08")!.main, 300);
});

test("POS cash by day: only paid cash orders", () => {
  const m = posCashByDay(
    [
      { createdAt: "2026-05-01T10:00:00Z", paymentMethod: "cash", paymentStatus: "paid", totalHal: 100 },
      { createdAt: "2026-05-01T11:00:00Z", paymentMethod: "cash", paymentStatus: "paid", totalHal: 50 },
      { createdAt: "2026-05-01T12:00:00Z", paymentMethod: "card", paymentStatus: "paid", totalHal: 999 },
      { createdAt: "2026-05-01T12:00:00Z", paymentMethod: "cash", paymentStatus: "canceled", totalHal: 999 },
      { createdAt: "2026-05-02T09:00:00Z", paymentMethod: "account", paymentStatus: "paid", totalHal: 999 },
    ],
    (iso) => iso.slice(0, 10),
  );
  assert.deepEqual([...m.entries()], [["2026-05-01", { cashHal: 150, count: 2 }]]);
});

test("FIO JSON parse", () => {
  const json = {
    accountStatement: {
      transactionList: {
        transaction: [
          {
            column22: { value: 26061234567, name: "ID pohybu", id: 22 },
            column0: { value: "2026-11-20+0100", name: "Datum", id: 0 },
            column1: { value: -1210.5, name: "Objem", id: 1 },
            column2: { value: "2400112233", name: "Protiúčet", id: 2 },
            column3: { value: "2010", name: "Kód banky", id: 3 },
            column5: { value: "20260042", name: "VS", id: 5 },
            column10: { value: "Makro Cash & Carry", name: "Název protiúčtu", id: 10 },
            column16: { value: "Faktura 42", name: "Zpráva pro příjemce", id: 16 },
            column8: { value: "Platba převodem uvnitř banky", name: "Typ", id: 8 },
          },
          { column0: { value: "2026-11-20+0100" }, column1: { value: 5 } },
        ],
      },
    },
  };
  const [t, ...rest] = parseFio(json, "now");
  assert.equal(rest.length, 0, "pohyb bez ID se přeskočí");
  assert.deepEqual(t, {
    id: "26061234567", date: "2026-11-20", amountHal: -121050, counterAccount: "2400112233/2010",
    counterName: "Makro Cash & Carry", vs: "20260042", message: "Faktura 42", type: "Platba převodem uvnitř banky",
    docId: null, ignored: false, importedAt: "now",
  });
  assert.deepEqual(parseFio({}, "now"), []);
});

test("bank matching and category suggestion", () => {
  const a = doc({ status: "unpaid", direction: "out", amountHal: 12100, date: null, dueDate: "2026-05-20", variableSymbol: "1" });
  const b = doc({ status: "unpaid", direction: "out", amountHal: 12100, date: null, dueDate: "2026-05-11", variableSymbol: "77" });
  const c = doc({ status: "unpaid", direction: "in", amountHal: 12100, date: null });
  assert.deepEqual(matchCandidates(tx({ vs: "77" }), [a, b, c]).map((d) => d.id), [b.id, a.id]);
  assert.deepEqual(matchCandidates(tx({}), [a, b, c]).map((d) => d.id), [b.id, a.id], "bez VS podle data");
  assert.deepEqual(matchCandidates(tx({ amountHal: -1 }), [a]), []);
  const hist = [
    { tx: tx({ id: "x", counterName: "MAKRO" }), categoryId: "zbozi" },
    { tx: tx({ id: "y" }), categoryId: "zbozi" },
    { tx: tx({ id: "z" }), categoryId: "material" },
    { tx: tx({ id: "w", amountHal: 500 }), categoryId: "trzby" },
  ];
  assert.equal(suggestCategory(tx({ id: "new" }), hist), "zbozi");
  assert.equal(suggestCategory(tx({ id: "new", counterName: "Jiný", counterAccount: "9/0100" }), hist), null);
});
