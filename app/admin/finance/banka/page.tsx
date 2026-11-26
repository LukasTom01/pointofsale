import { formatKc } from "@/lib/money";
import { dayShort } from "@/lib/team/format";
import { matchCandidates, suggestCategory } from "@/lib/finance/domain";
import { bankTxs, categories, docs, fioConfigured } from "@/lib/finance/service";
import ActionForm from "@/components/team/ActionForm";
import FinanceNav from "@/components/finance/FinanceNav";
import { bankBook, bankIgnore, bankPair, fioImportAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export default async function BankPage({ searchParams }: { searchParams: Promise<{ vse?: string }> }) {
  const sp = await searchParams;
  const [txs, cats, all] = await Promise.all([bankTxs(), categories(), docs()]);
  const sorted = txs.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const open = sorted.filter((t) => !t.docId && !t.ignored);
  const rest = sorted.filter((t) => t.docId || t.ignored).slice(0, sp.vse ? undefined : 30);
  const history = txs.filter((t) => t.docId).map((t) => ({ tx: t, categoryId: all.find((d) => d.id === t.docId)?.categoryId ?? null }));
  const docNumber = new Map(all.map((d) => [d.id, d.number]));
  const usable = cats.filter((c) => c.active || c.transfer);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Banka</h1>
      <FinanceNav active="/admin/finance/banka" />

      {fioConfigured() ? (
        <ActionForm action={fioImportAction} className="flex flex-wrap items-center gap-3">
          <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">⟳ Stáhnout pohyby z FIO</button>
          <span className="text-xs text-slate-500">Stahuje se od posledního importu; FIO dovolí 1 dotaz za 30 s.</span>
        </ActionForm>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Napojení na FIO není nastavené. V internetbankingu FIO vytvořte token jen pro čtení (Nastavení → API) a vložte ho na
          Vercelu jako proměnnou <code>FIO_TOKEN</code>.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">K zaúčtování ({open.length})</h2>
        {open.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">Vše zaúčtováno. 👍</p> : null}
        {open.map((t) => {
          const dir = t.amountHal >= 0 ? "in" : "out";
          const candidates = matchCandidates(t, all);
          const suggested = suggestCategory(t, history);
          return (
            <div key={t.id} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm">
                  <span className="text-slate-500">{dayShort(t.date)}</span> · <strong>{t.counterName ?? t.counterAccount ?? "—"}</strong>
                  {t.message ? <span className="text-slate-600"> · {t.message}</span> : null}
                  {t.vs ? <span className="text-xs text-slate-500"> · VS {t.vs}</span> : null}
                </div>
                <span className={`text-lg font-bold tabular-nums ${dir === "in" ? "text-emerald-700" : "text-red-700"}`}>
                  {dir === "in" ? "+" : "−"}
                  {formatKc(Math.abs(t.amountHal))}
                </span>
              </div>
              {candidates.length ? (
                <ActionForm action={bankPair} className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-2">
                  <input type="hidden" name="txId" value={t.id} />
                  <span className="text-sm">Úhrada dokladu:</span>
                  <select name="docId" className={field}>
                    {candidates.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.counterparty ?? d.description} {d.invoiceNumber ? `· ${d.invoiceNumber}` : ""} {d.variableSymbol === t.vs && t.vs ? "· VS sedí" : ""}
                      </option>
                    ))}
                  </select>
                  <button className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">Spárovat</button>
                </ActionForm>
              ) : null}
              <ActionForm action={bankBook} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="txId" value={t.id} />
                <select name="categoryId" required defaultValue={suggested ?? ""} className={`${field} min-w-56`}>
                  <option value="" disabled>
                    Kategorie…
                  </option>
                  {usable
                    .filter((c) => c.direction === dir)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.transfer ? (dir === "in" ? "Vklad hotovosti z pokladny" : "Výběr hotovosti do pokladny") : c.name}
                      </option>
                    ))}
                </select>
                <input name="description" maxLength={200} placeholder={t.message ?? "Popis"} className={`${field} min-w-40 flex-1`} />
                <select name="activity" defaultValue="" className={field} aria-label="Činnost">
                  <option value="">Činnost podle kategorie</option>
                  <option value="main">Hlavní</option>
                  <option value="side">Hospodářská</option>
                </select>
                <button className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Zaúčtovat</button>
              </ActionForm>
              <form action={bankIgnore}>
                <input type="hidden" name="txId" value={t.id} />
                <button className="text-xs text-slate-500 hover:underline">Nezaúčtovávat (např. duplicitní / interní)</button>
              </form>
            </div>
          );
        })}
      </section>

      {rest.length ? (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Vyřízené</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {rest.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span>
                  <span className="text-slate-500">{dayShort(t.date)}</span> · {t.counterName ?? t.counterAccount ?? "—"}
                  {t.message ? <span className="text-slate-500"> · {t.message}</span> : null}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="tabular-nums">{formatKc(t.amountHal)}</span>
                  {t.docId ? (
                    <span className="font-mono text-xs text-slate-500">{docNumber.get(t.docId) ?? "?"}</span>
                  ) : (
                    <form action={bankIgnore}>
                      <input type="hidden" name="txId" value={t.id} />
                      <button className="text-xs text-slate-500 underline">vrátit k zaúčtování</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
