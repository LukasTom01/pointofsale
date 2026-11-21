// Výkaz hodin do Excelu: list „Souhrn“ + list pro každého člověka. Bez peněz.
// Chráněno middlewarem (/api/team*), navíc explicitní kontrola.
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminServer";
import { loadReport } from "@/lib/team/report";
import { actualMinutes, formatRange, pragueClock, toHours } from "@/lib/team/domain";
import { dayShort } from "@/lib/team/format";

export const dynamic = "force-dynamic";

const ATT = { planned: "plán", present: "přišel/a", absent: "nepřišel/a" } as const;

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Nepřihlášeno" }, { status: 401 });
  }
  const sp = Object.fromEntries(new URL(req.url).searchParams) as { od?: string; do?: string; akce?: string };
  const { event, period, shifts, rows, roleName } = await loadReport(sp);

  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet("Souhrn");
  summary.addRow([`Výkaz hodin ${dayShort(period.from)} – ${dayShort(period.to)}${event ? ` · ${event.name}` : ""}`]).font = { bold: true, size: 13 };
  summary.addRow([]);
  const head = summary.addRow(["Člověk", "Směn", "Plán (h)", "Odpracováno (h)", "Nepřišel/a"]);
  head.font = { bold: true };
  for (const r of rows) summary.addRow([r.name, r.shifts, toHours(r.plannedMin), toHours(r.actualMin), r.absent]);
  summary.columns.forEach((c, i) => (c.width = i === 0 ? 28 : 16));

  const used = new Set<string>();
  for (const r of rows) {
    // Název listu: max 31 znaků, bez zakázaných znaků, unikátní.
    let name = r.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 28).trim() || "Člověk";
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 26)} ${n}`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    ws.addRow([r.name]).font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.addRow(["Den", "Plán", "Pozice", "Stav", "Příchod", "Odchod", "Odpracováno (h)", "Poznámka"]).font = { bold: true };
    for (const s of shifts.filter((x) => x.staffId === r.staffId)) {
      const worked = s.attendance === "absent" ? null : actualMinutes(s.checkInAt, s.checkOutAt);
      ws.addRow([
        dayShort(s.day),
        formatRange(s.startMin, s.endMin),
        s.roleId ? (roleName.get(s.roleId) ?? "") : "",
        ATT[s.attendance],
        pragueClock(s.checkInAt),
        pragueClock(s.checkOutAt),
        worked != null ? toHours(worked) : "",
        s.note ?? "",
      ]);
    }
    ws.addRow([]);
    ws.addRow(["Celkem", "", "", "", "", "", toHours(r.actualMin)]).font = { bold: true };
    ws.columns.forEach((c, i) => (c.width = [12, 13, 16, 12, 10, 10, 16, 30][i]));
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vykaz-${period.from}_${period.to}.xlsx"`,
    },
  });
}
