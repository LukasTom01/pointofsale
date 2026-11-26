// Export financí do Excelu: peněžní deník, přehled o příjmech a výdajích, kategorie, nezaplacené.
// Chráněno middlewarem (/api/finance*), navíc explicitní kontrola.
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminServer";
import { pragueToday } from "@/lib/team/domain";
import { balances, incomeStatement, ledger, rowLabel } from "@/lib/finance/domain";
import { categories, docs, openingFor, settings } from "@/lib/finance/service";

export const dynamic = "force-dynamic";

const kc = (h: number) => Math.round(h) / 100;
const MONEY = '#,##0.00 "Kč"';

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Nepřihlášeno" }, { status: 401 });
  }
  const rok = new URL(req.url).searchParams.get("rok") ?? "";
  const year = /^\d{4}$/.test(rok) ? rok : pragueToday().slice(0, 4);
  const [all, cats, s] = await Promise.all([docs(), categories(), settings()]);
  const opening = openingFor(s, year);
  const rows = ledger(all, year, opening);
  const catOf = new Map(cats.map((c) => [c.id, c]));
  const wb = new ExcelJS.Workbook();

  // Peněžní deník
  const ws = wb.addWorksheet("Peněžní deník");
  ws.addRow([`Peněžní deník ${year}${s.orgName ? ` · ${s.orgName}` : ""}${s.ico ? ` · IČO ${s.ico}` : ""}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow([
    "Datum", "Doklad", "Popis", "Protistrana", "Kategorie", "Řádek výkazu", "Činnost",
    "Pokladna příjem", "Pokladna výdaj", "Účet příjem", "Účet výdaj", "Stav pokladny", "Stav účtu",
  ]).font = { bold: true };
  ws.addRow(["", "", "Počáteční stav", "", "", "", "", "", "", "", "", kc(opening.cashHal), kc(opening.bankHal)]);
  for (const r of rows) {
    const c = r.doc.categoryId ? catOf.get(r.doc.categoryId) : undefined;
    ws.addRow([
      r.doc.date, r.doc.number, r.doc.description, r.doc.counterparty ?? "", c?.name ?? "",
      c ? `${c.row} ${rowLabel(c.row)}` : "", r.doc.activity === "side" ? "hospodářská" : "hlavní",
      kc(r.cashIn) || null, kc(r.cashOut) || null, kc(r.bankIn) || null, kc(r.bankOut) || null,
      kc(r.cashBalance), kc(r.bankBalance),
    ]);
  }
  const sum = (k: "cashIn" | "cashOut" | "bankIn" | "bankOut") => kc(rows.reduce((x, r) => x + r[k], 0));
  const end = balances(all, year, opening);
  ws.addRow(["", "", "Celkem", "", "", "", "", sum("cashIn"), sum("cashOut"), sum("bankIn"), sum("bankOut"), kc(end.cashHal), kc(end.bankHal)]).font = { bold: true };
  ws.columns.forEach((col, i) => {
    col.width = [11, 15, 40, 24, 26, 30, 12][i] ?? 15;
    if (i >= 7) col.numFmt = MONEY;
  });

  // Přehled o příjmech a výdajích
  const st = incomeStatement(all, cats, year);
  const vs = wb.addWorksheet("Příjmy a výdaje");
  vs.addRow([`Přehled o příjmech a výdajích ${year} (příloha č. 1 vyhl. 325/2015 Sb.)`]).font = { bold: true, size: 13 };
  vs.addRow([]);
  vs.addRow(["Řádek", "Položka", "Hlavní činnost", "Hospodářská činnost", "Celkem", "Celkem v tis. Kč"]).font = { bold: true };
  const line = (row: string, label: string, main: number, side: number, bold = false) => {
    const r = vs.addRow([row, label, kc(main), kc(side), kc(main + side), Math.round((main + side) / 100 / 1000)]);
    if (bold) r.font = { bold: true };
  };
  vs.addRow(["A.", "PŘÍJMY"]).font = { bold: true };
  for (const l of st.lines.filter((l) => l.row.startsWith("A"))) line(l.row.slice(1), l.label, l.main, l.side);
  line("", "Příjmy celkem", st.income.main, st.income.side, true);
  vs.addRow(["B.", "VÝDAJE"]).font = { bold: true };
  for (const l of st.lines.filter((l) => l.row.startsWith("B"))) line(l.row.slice(1), l.label, l.main, l.side);
  line("", "Výdaje celkem", st.expense.main, st.expense.side, true);
  line("", "Rozdíl příjmů a výdajů", st.result.main, st.result.side, true);
  vs.columns.forEach((col, i) => {
    col.width = [8, 46, 18, 20, 18, 16][i] ?? 15;
    if (i >= 2 && i <= 4) col.numFmt = MONEY;
  });

  // Nezaplacené (kniha pohledávek a závazků)
  const un = wb.addWorksheet("Nezaplacené");
  un.addRow(["Typ", "Protistrana", "IČO", "Č. dokladu", "VS", "Vystaveno", "Splatnost", "Částka", "Popis"]).font = { bold: true };
  for (const d of all.filter((d) => d.status === "unpaid")) {
    un.addRow([d.direction === "in" ? "pohledávka" : "závazek", d.counterparty ?? "", d.ico ?? "", d.invoiceNumber ?? "", d.variableSymbol ?? "", d.issueDate ?? "", d.dueDate ?? "", kc(d.amountHal), d.description]);
  }
  un.columns.forEach((col, i) => {
    col.width = [12, 28, 12, 16, 12, 12, 12, 14, 40][i] ?? 15;
    if (i === 7) col.numFmt = MONEY;
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="finance-${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
