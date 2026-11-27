import { formatKc } from "@/lib/money";
import { pragueToday } from "@/lib/team/domain";
import { balances, incomeStatement } from "@/lib/finance/domain";
import { categories, docs, openingFor, settings } from "@/lib/finance/service";
import FinanceNav from "@/components/finance/FinanceNav";

export const dynamic = "force-dynamic";

const tis = (h: number) => Math.round(h / 100 / 1000).toLocaleString("cs-CZ");

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ rok?: string }> }) {
  const sp = await searchParams;
  const today = pragueToday();
  const year = /^\d{4}$/.test(sp.rok ?? "") ? sp.rok! : today.slice(0, 4);
  const [all, cats, s] = await Promise.all([docs(), categories(), settings()]);
  const stmt = incomeStatement(all, cats, year);
  const opening = openingFor(s, year);
  const end = balances(all, year, opening);
  const yearEnd = `${year}-12-31`;
  const openAt = all.filter((d) => d.status === "unpaid" && (d.issueDate ?? "0") <= yearEnd);
  const receivables = openAt.filter((d) => d.direction === "in").reduce((x, d) => x + d.amountHal, 0);
  const payables = openAt.filter((d) => d.direction === "out").reduce((x, d) => x + d.amountHal, 0);
  const sideResult = stmt.result.side;

  const Line = ({ label, main, side, strong }: { label: string; main: number; side: number; strong?: boolean }) => (
    <tr className={strong ? "bg-slate-50 font-semibold" : ""}>
      <td className="py-1.5 pr-3">{label}</td>
      <td className="px-2 text-right">{formatKc(main)}</td>
      <td className="px-2 text-right">{formatKc(side)}</td>
      <td className="px-2 text-right">{formatKc(main + side)}</td>
      <td className="px-2 text-right text-slate-500">{tis(main + side)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Výkazy {year}</h1>
      <FinanceNav active="/admin/finance/vykazy" />
      <form method="get" className="flex items-center gap-2 text-sm">
        <input name="rok" defaultValue={year} className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-2" />
        <button className="h-10 rounded-lg border border-slate-300 bg-white px-3">Zobrazit</button>
        <a href={`/api/finance/export?rok=${year}`} className="ml-auto h-10 rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">
          ⬇ Excel (deník + výkazy)
        </a>
      </form>

      <section className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold">Přehled o příjmech a výdajích</h2>
        <p className="mb-2 text-xs text-slate-500">
          Podle přílohy č. 1 vyhlášky č. 325/2015 Sb. Do tiskopisu se vyplňují tisíce Kč (poslední sloupec). Průběžné položky
          (převody pokladna ↔ účet) nejsou v celkových příjmech a výdajích.
        </p>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Řádek</th>
              <th className="px-2 text-right font-medium">Hlavní činnost</th>
              <th className="px-2 text-right font-medium">Hospodářská činnost</th>
              <th className="px-2 text-right font-medium">Celkem</th>
              <th className="px-2 text-right font-medium">v tis. Kč</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td colSpan={5} className="pt-2 text-xs font-semibold text-slate-500">
                A. PŘÍJMY
              </td>
            </tr>
            {stmt.lines
              .filter((l) => l.row.startsWith("A"))
              .map((l) => (
                <Line key={l.row} label={`${l.row.slice(1)}. ${l.label}`} main={l.main} side={l.side} />
              ))}
            <Line label="Příjmy celkem" main={stmt.income.main} side={stmt.income.side} strong />
            <tr>
              <td colSpan={5} className="pt-3 text-xs font-semibold text-slate-500">
                B. VÝDAJE
              </td>
            </tr>
            {stmt.lines
              .filter((l) => l.row.startsWith("B"))
              .map((l) => (
                <Line key={l.row} label={`${l.row.slice(1)}. ${l.label}`} main={l.main} side={l.side} />
              ))}
            <Line label="Výdaje celkem" main={stmt.expense.main} side={stmt.expense.side} strong />
            <Line label="Rozdíl příjmů a výdajů" main={stmt.result.main} side={stmt.result.side} strong />
          </tbody>
        </table>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold">Přehled o majetku a závazcích – podklady</h2>
        <p className="mb-2 text-xs text-slate-500">
          Peněžní prostředky a nezaplacené doklady z appky. Případný další majetek (vybavení stánku apod.) doplňte do tiskopisu sami.
        </p>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Položka</th>
              <th className="px-2 text-right font-medium">K 1. 1. {year}</th>
              <th className="px-2 text-right font-medium">K 31. 12. {year}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-1.5 pr-3">Peněžní prostředky v hotovosti</td>
              <td className="px-2 text-right">{formatKc(opening.cashHal)}</td>
              <td className="px-2 text-right">{formatKc(end.cashHal)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3">Peněžní prostředky na bankovních účtech</td>
              <td className="px-2 text-right">{formatKc(opening.bankHal)}</td>
              <td className="px-2 text-right">{formatKc(end.bankHal)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3">Pohledávky (nezaplacené vydané doklady)</td>
              <td className="px-2 text-right text-slate-400">—</td>
              <td className="px-2 text-right">{formatKc(receivables)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3">Závazky (nezaplacené přijaté doklady)</td>
              <td className="px-2 text-right text-slate-400">—</td>
              <td className="px-2 text-right">{formatKc(payables)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-xl bg-white p-4 text-sm shadow-sm">
        <h2 className="mb-1 font-semibold">Daň z příjmů – podklad</h2>
        <p>
          Výsledek hospodářské činnosti: <strong className={sideResult < 0 ? "text-red-600" : ""}>{formatKc(sideResult)}</strong>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          U spolku se dani obvykle podrobují příjmy z hospodářské činnosti (prodej na stánku), příjmy z hlavní činnosti, dary a
          členské příspěvky zpravidla ne. Rozdělení na hlavní a hospodářskou činnost a výpočet daně si nechte jednou ověřit
          daňovým poradcem.
        </p>
      </section>
    </div>
  );
}
