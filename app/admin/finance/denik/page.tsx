import Link from "next/link";
import { formatKc } from "@/lib/money";
import { pragueToday } from "@/lib/team/domain";
import { dayShort } from "@/lib/team/format";
import { finStore } from "@/lib/finance/store";
import { ledger } from "@/lib/finance/domain";
import { categories, docs, openingFor, settings } from "@/lib/finance/service";
import ActionForm from "@/components/team/ActionForm";
import AttachmentInput from "@/components/team/AttachmentInput";
import DocFields from "@/components/finance/DocFields";
import FinanceNav from "@/components/finance/FinanceNav";
import { deleteDocAction, deleteFileAction, saveDocAction } from "../actions";

export const dynamic = "force-dynamic";

const kc = (h: number) => (h ? formatKc(h) : "");
const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ rok?: string; mesic?: string }> }) {
  const sp = await searchParams;
  const today = pragueToday();
  const year = /^\d{4}$/.test(sp.rok ?? "") ? sp.rok! : today.slice(0, 4);
  const month = /^(0[1-9]|1[0-2])$/.test(sp.mesic ?? "") ? sp.mesic! : "";
  const [all, cats, s, files] = await Promise.all([docs(), categories(), settings(), finStore.listFiles()]);
  const opening = openingFor(s, year);
  const rows = ledger(all, year, opening);
  const shown = month ? rows.filter((r) => r.doc.date!.slice(5, 7) === month) : rows;
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const years = [...new Set([year, today.slice(0, 4), ...all.map((d) => d.date?.slice(0, 4)).filter(Boolean)])].sort().reverse() as string[];
  const sum = (k: "cashIn" | "cashOut" | "bankIn" | "bankOut") => shown.reduce((s, r) => s + r[k], 0);
  const before = month ? rows.filter((r) => r.doc.date!.slice(5, 7) < month).at(-1) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Peněžní deník</h1>
      <FinanceNav active="/admin/finance/denik" />
      <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
        <select name="rok" defaultValue={year} className="h-10 rounded-lg border border-slate-300 bg-white px-2">
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select name="mesic" defaultValue={month} className="h-10 rounded-lg border border-slate-300 bg-white px-2">
          <option value="">Celý rok</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg border border-slate-300 bg-white px-3">Zobrazit</button>
        <a href={`/api/finance/export?rok=${year}`} className="ml-auto h-10 rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">
          ⬇ Excel {year}
        </a>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2">Datum</th>
              <th className="px-2 py-2">Doklad</th>
              <th className="px-2 py-2">Popis</th>
              <th className="px-2 py-2">Kategorie</th>
              <th className="px-2 py-2 text-right">Pokladna +</th>
              <th className="px-2 py-2 text-right">Pokladna −</th>
              <th className="px-2 py-2 text-right">Účet +</th>
              <th className="px-2 py-2 text-right">Účet −</th>
              <th className="px-2 py-2 text-right">Stav pokladny</th>
              <th className="px-2 py-2 text-right">Stav účtu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            <tr className="text-slate-500">
              <td className="px-2 py-1.5" colSpan={8}>
                {month ? `Zůstatek před ${MONTHS[Number(month) - 1]}em` : `Počáteční stav k 1. 1. ${year}`}
              </td>
              <td className="px-2 text-right">{formatKc(before?.cashBalance ?? opening.cashHal)}</td>
              <td className="px-2 text-right">{formatKc(before?.bankBalance ?? opening.bankHal)}</td>
            </tr>
            {shown.map((r) => {
              const d = r.doc;
              const own = files.filter((f) => f.docId === d.id);
              return (
                <tr key={d.id} className="align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap">{dayShort(d.date!)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-xs">{d.number}</td>
                  <td className="px-2 py-1.5">
                    <details>
                      <summary className="cursor-pointer">
                        {d.description}
                        {d.counterparty ? <span className="text-slate-500"> · {d.counterparty}</span> : null}
                        {own.length ? " 📎" : ""}
                        {d.activity === "side" ? <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">HČ</span> : null}
                      </summary>
                      <div className="mt-2 w-[min(80vw,40rem)] space-y-2 rounded-lg bg-slate-50 p-3">
                        {own.map((f) => (
                          <form key={f.id} action={deleteFileAction} className="flex items-center gap-2 text-xs">
                            <a href={`/api/finance/files/${f.id}`} target="_blank" rel="noopener" className="underline">
                              📎 {f.name}
                            </a>
                            <input type="hidden" name="fileId" value={f.id} />
                            <button className="text-red-600">smazat</button>
                          </form>
                        ))}
                        {d.pairDocId ? <p className="text-xs text-slate-500">Převod – protidoklad se upraví automaticky.</p> : null}
                        {d.bankTxId ? <p className="text-xs text-slate-500">Spárováno s pohybem na účtu.</p> : null}
                        <ActionForm action={saveDocAction} className="space-y-2">
                          <input type="hidden" name="docId" value={d.id} />
                          <DocFields doc={d} cats={cats} today={today} />
                          <AttachmentInput />
                          <button className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Uložit</button>
                        </ActionForm>
                        <ActionForm action={deleteDocAction} confirm={`Smazat doklad ${d.number}?`}>
                          <input type="hidden" name="docId" value={d.id} />
                          <button className="text-xs text-red-600 hover:underline">Smazat doklad</button>
                        </ActionForm>
                      </div>
                    </details>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">{d.categoryId ? catName.get(d.categoryId) : ""}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-700">{kc(r.cashIn)}</td>
                  <td className="px-2 py-1.5 text-right text-red-700">{kc(r.cashOut)}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-700">{kc(r.bankIn)}</td>
                  <td className="px-2 py-1.5 text-right text-red-700">{kc(r.bankOut)}</td>
                  <td className={`px-2 py-1.5 text-right ${r.cashBalance < 0 ? "font-bold text-red-600" : ""}`}>{formatKc(r.cashBalance)}</td>
                  <td className="px-2 py-1.5 text-right">{formatKc(r.bankBalance)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold tabular-nums">
            <tr>
              <td className="px-2 py-2" colSpan={4}>
                Celkem {month ? MONTHS[Number(month) - 1] : year} ({shown.length} zápisů)
              </td>
              <td className="px-2 text-right">{formatKc(sum("cashIn"))}</td>
              <td className="px-2 text-right">{formatKc(sum("cashOut"))}</td>
              <td className="px-2 text-right">{formatKc(sum("bankIn"))}</td>
              <td className="px-2 text-right">{formatKc(sum("bankOut"))}</td>
              <td className="px-2 text-right">{formatKc(shown.at(-1)?.cashBalance ?? before?.cashBalance ?? opening.cashHal)}</td>
              <td className="px-2 text-right">{formatKc(shown.at(-1)?.bankBalance ?? before?.bankBalance ?? opening.bankHal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        HČ = hospodářská činnost. Nové doklady zapíšete v <Link href="/admin/finance" className="underline">Přehledu</Link>.
      </p>
    </div>
  );
}
