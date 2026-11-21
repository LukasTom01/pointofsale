import Link from "next/link";
import { loadReport } from "@/lib/team/report";
import { dayShort, hoursText } from "@/lib/team/format";

export const dynamic = "force-dynamic";

export default async function AttendanceSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ od?: string; do?: string; akce?: string }>;
}) {
  const sp = await searchParams;
  const { events, event, period, rows } = await loadReport(sp);
  const sum = rows.reduce(
    (acc, r) => ({ shifts: acc.shifts + r.shifts, planned: acc.planned + r.plannedMin, actual: acc.actual + r.actualMin, absent: acc.absent + r.absent }),
    { shifts: 0, planned: 0, actual: 0, absent: 0 },
  );
  const exportQuery = new URLSearchParams({ od: period.from, do: period.to, ...(event ? { akce: event.id } : {}) });
  const input = "mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/dochazka" className="text-sm text-slate-500 hover:underline">
            ← Docházka
          </Link>
          <h1 className="text-xl font-bold">Souhrn hodin</h1>
        </div>
        <a
          href={`/api/team/export?${exportQuery}`}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Stáhnout výkaz (Excel)
        </a>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Od
          <input type="date" name="od" defaultValue={period.from} className={input} />
        </label>
        <label className="text-xs text-slate-500">
          Do
          <input type="date" name="do" defaultValue={period.to} className={input} />
        </label>
        {events.length > 0 ? (
          <label className="text-xs text-slate-500">
            Akce
            <select name="akce" defaultValue={event?.id ?? ""} className={input}>
              <option value="">Všechny směny</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">Zobrazit</button>
      </form>

      <p className="text-sm text-slate-600">
        {dayShort(period.from)} – {dayShort(period.to)}
        {event ? ` · ${event.name}` : ""}. Odpracováno se počítá jen ze směn se zapsaným příchodem i odchodem.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">V tomto období nejsou žádné směny.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Člověk</th>
                <th className="px-3 py-2 text-right font-medium">Směn</th>
                <th className="px-3 py-2 text-right font-medium">Plán</th>
                <th className="px-3 py-2 text-right font-medium">Odpracováno</th>
                <th className="px-3 py-2 text-right font-medium">Nepřišel/a</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.staffId}>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.shifts}</td>
                  <td className="px-3 py-2 text-right">{hoursText(r.plannedMin)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{hoursText(r.actualMin)}</td>
                  <td className={`px-3 py-2 text-right ${r.absent ? "text-red-600" : "text-slate-400"}`}>{r.absent}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold">
              <tr>
                <td className="px-3 py-2">Celkem</td>
                <td className="px-3 py-2 text-right">{sum.shifts}</td>
                <td className="px-3 py-2 text-right">{hoursText(sum.planned)}</td>
                <td className="px-3 py-2 text-right">{hoursText(sum.actual)}</td>
                <td className="px-3 py-2 text-right">{sum.absent}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
