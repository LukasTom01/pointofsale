import Link from "next/link";
import { formatKc } from "@/lib/money";
import { pragueToday } from "@/lib/team/domain";
import { dayLabel } from "@/lib/team/format";
import { finStore } from "@/lib/finance/store";
import { aiConfigured } from "@/lib/finance/ai";
import { balances, incomeStatement, ledger, negativeCashDays } from "@/lib/finance/domain";
import { bankTxs, categories, docs, fioConfigured, openingFor, pendingPosDays, settings } from "@/lib/finance/service";
import type { FinFile } from "@/lib/finance/types";
import ActionForm from "@/components/team/ActionForm";
import AttachmentInput from "@/components/team/AttachmentInput";
import DocFields from "@/components/finance/DocFields";
import FinanceNav from "@/components/finance/FinanceNav";
import UploadDocs from "@/components/finance/UploadDocs";
import { bookPos, deleteDocAction, saveDocAction, uploadDocs } from "./actions";

export const dynamic = "force-dynamic";

function Files({ files }: { files: FinFile[] }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) =>
        f.mime.startsWith("image/") ? (
          <a key={f.id} href={`/api/finance/files/${f.id}`} target="_blank" rel="noopener">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/finance/files/${f.id}`} alt={f.name} className="h-28 w-28 rounded-lg border object-cover" />
          </a>
        ) : (
          <a key={f.id} href={`/api/finance/files/${f.id}`} target="_blank" rel="noopener" className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
            📄 {f.name}
          </a>
        ),
      )}
    </div>
  );
}

export default async function FinancePage() {
  const today = pragueToday();
  const year = today.slice(0, 4);
  const [all, cats, s, txs, files, pos] = await Promise.all([
    docs(),
    categories(),
    settings(),
    bankTxs(),
    finStore.listFiles(),
    pendingPosDays(),
  ]);
  const opening = openingFor(s, year);
  const bal = balances(all, year, opening);
  const stmt = incomeStatement(all, cats, year);
  const negative = negativeCashDays(ledger(all, year, opening));
  const drafts = all.filter((d) => d.status === "draft").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const unpaid = all.filter((d) => d.status === "unpaid").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const openTx = txs.filter((t) => !t.docId && !t.ignored).length;
  const filesOf = (id: string) => files.filter((f) => f.docId === id);
  const income = stmt.income.main + stmt.income.side;
  const expense = stmt.expense.main + stmt.expense.side;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Finance {year}</h1>
      <FinanceNav active="/admin/finance" />

      {!s.opening[year] ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Doplňte počáteční stav pokladny a účtu k 1. 1. {year} v{" "}
          <Link href="/admin/finance/nastaveni" className="underline">
            Nastavení
          </Link>
          , jinak zůstatky nebudou sedět.
        </p>
      ) : null}
      {negative.length ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          ⚠️ Pokladna by šla do minusu ({negative.map(dayLabel).join(", ")}). V hotovosti nejde vydat víc, než v ní je – chybí zřejmě
          příjem (tržba, výběr z účtu) nebo je výdaj zapsaný v pokladně místo na účtu.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Pokladna", value: bal.cashHal },
          { label: "Účet", value: bal.bankHal },
          { label: "Příjmy letos", value: income },
          { label: "Výdaje letos", value: expense },
          { label: "Výsledek letos", value: income - expense },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.value < 0 ? "text-red-600" : ""}`}>{formatKc(c.value)}</p>
          </div>
        ))}
      </div>

      {pos.length || openTx ? (
        <section className="space-y-3 rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">K vyřízení</h2>
          {pos.length ? (
            <ActionForm action={bookPos} className="space-y-2">
              {pos.map((p) => (
                <input key={p.day} type="hidden" name="day" value={p.day} />
              ))}
              <p className="text-sm">
                Tržby v hotovosti z pokladny za {pos.length} {pos.length === 1 ? "den" : pos.length < 5 ? "dny" : "dní"}:{" "}
                <strong>{formatKc(pos.reduce((s, p) => s + p.cashHal, 0))}</strong>
                <span className="text-slate-500"> ({pos.map((p) => `${dayLabel(p.day)} ${formatKc(p.cashHal)}`).join(", ")})</span>
              </p>
              <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Zaúčtovat do pokladny</button>
              <p className="text-xs text-slate-500">Platby kartou se zaúčtují, až přijdou na účet (v sekci Banka).</p>
            </ActionForm>
          ) : null}
          {openTx ? (
            <p className="text-sm">
              <Link href="/admin/finance/banka" className="font-semibold underline">
                {openTx} pohybů na účtu
              </Link>{" "}
              čeká na zaúčtování.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-semibold">Nahrát doklady</h2>
        <UploadDocs action={uploadDocs} aiOn={aiConfigured()} />
      </section>

      {drafts.length ? (
        <section className="space-y-3">
          <h2 className="font-semibold">
            Ke kontrole <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs text-white">{drafts.length}</span>
          </h2>
          {drafts.map((d) => (
            <div key={d.id} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
              <Files files={filesOf(d.id)} />
              <ActionForm action={saveDocAction} className="space-y-2">
                <input type="hidden" name="docId" value={d.id} />
                <DocFields doc={d} cats={cats} today={today} />
                <button className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white">✓ Potvrdit</button>
              </ActionForm>
              <ActionForm action={deleteDocAction} confirm="Zahodit tento doklad?">
                <input type="hidden" name="docId" value={d.id} />
                <button className="text-xs text-red-600 hover:underline">Zahodit</button>
              </ActionForm>
            </div>
          ))}
        </section>
      ) : null}

      {unpaid.length ? (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Nezaplacené doklady (závazky a pohledávky)</h2>
          <ul className="divide-y divide-slate-100">
            {unpaid.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className={d.direction === "in" ? "text-emerald-700" : ""}>{d.direction === "in" ? "Pohledávka" : "Závazek"}</span> ·{" "}
                    <strong>{d.counterparty ?? d.description}</strong> {d.invoiceNumber ? `· ${d.invoiceNumber}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {formatKc(d.amountHal)}
                    {d.dueDate ? (
                      <span className={`ml-2 text-xs ${d.dueDate < today ? "font-semibold text-red-600" : "text-slate-500"}`}>
                        splatnost {dayLabel(d.dueDate)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-slate-500">Zaplaceno / upravit</summary>
                  <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                    <Files files={filesOf(d.id)} />
                    <ActionForm action={saveDocAction} className="space-y-2">
                      <input type="hidden" name="docId" value={d.id} />
                      <DocFields doc={{ ...d, status: "booked", channel: "cash", date: today }} cats={cats} today={today} />
                      <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Uložit</button>
                    </ActionForm>
                    <p className="text-xs text-slate-500">Platbu z účtu stačí spárovat v sekci Banka – doklad se nabídne sám.</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Zapsat doklad ručně</h2>
        <ActionForm action={saveDocAction} className="space-y-2" resetOnOk>
          <DocFields cats={cats} today={today} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <AttachmentInput />
            <button className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white">Zapsat</button>
          </div>
        </ActionForm>
      </section>

      <p className="text-xs text-slate-500">
        {fioConfigured() ? "Banka: FIO napojená." : "Banka: FIO zatím není napojená (FIO_TOKEN)."} ·{" "}
        {aiConfigured() ? "Čtení dokladů zapnuté." : "Čtení dokladů vypnuté (ANTHROPIC_API_KEY)."}
      </p>
    </div>
  );
}
