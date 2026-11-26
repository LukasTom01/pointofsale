import { halToKcInput } from "@/lib/money";
import { pragueToday } from "@/lib/team/domain";
import { ROWS, rowLabel } from "@/lib/finance/domain";
import { categories, openingFor, settings } from "@/lib/finance/service";
import ActionForm from "@/components/team/ActionForm";
import FinanceNav from "@/components/finance/FinanceNav";
import { saveCategory, saveSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

function RowSelect({ value }: { value?: string }) {
  return (
    <select name="row" defaultValue={value ?? ""} required className={field} aria-label="Řádek výkazu">
      <option value="" disabled>
        Řádek výkazu…
      </option>
      <optgroup label="Příjmy">
        {ROWS.filter((r) => r.direction === "in" && !r.passThrough).map((r) => (
          <option key={r.row} value={r.row}>
            {r.row.slice(1)}. {r.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Výdaje">
        {ROWS.filter((r) => r.direction === "out" && !r.passThrough).map((r) => (
          <option key={r.row} value={r.row}>
            {r.row.slice(1)}. {r.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export default async function FinanceSettingsPage({ searchParams }: { searchParams: Promise<{ rok?: string }> }) {
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.rok ?? "") ? sp.rok! : pragueToday().slice(0, 4);
  const [s, cats] = await Promise.all([settings(), categories()]);
  const opening = openingFor(s, year);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Nastavení financí</h1>
      <FinanceNav active="/admin/finance/nastaveni" />

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Spolek a počáteční stavy</h2>
        <ActionForm action={saveSettingsAction} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input name="orgName" defaultValue={s.orgName} placeholder="Název spolku" className={`${field} min-w-60 flex-1`} />
            <input name="ico" defaultValue={s.ico} placeholder="IČO" className={`${field} w-32`} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Stav k 1. 1.</span>
            <input name="year" defaultValue={year} className={`${field} w-20`} aria-label="Rok" />
            <label className="flex items-center gap-1">
              pokladna
              <input name="openingCash" inputMode="decimal" defaultValue={halToKcInput(opening.cashHal)} className={`${field} w-32`} />
            </label>
            <label className="flex items-center gap-1">
              účet
              <input name="openingBank" inputMode="decimal" defaultValue={halToKcInput(opening.bankHal)} className={`${field} w-32`} />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Stav pokladny podle skutečné hotovosti, stav účtu podle výpisu k 31. 12. předchozího roku.
          </p>
          <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Uložit</button>
        </ActionForm>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold">Kategorie příjmů a výdajů</h2>
        <p className="mb-2 text-xs text-slate-500">
          Každá kategorie patří do řádku výkazu a má výchozí činnost (hlavní / hospodářská), kterou jde u dokladu změnit.
        </p>
        <ul className="divide-y divide-slate-100">
          {cats
            .filter((c) => !c.transfer)
            .map((c) => (
              <li key={c.id} className="py-2">
                <ActionForm action={saveCategory} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="categoryId" value={c.id} />
                  <span className={`w-14 text-xs font-semibold ${c.direction === "in" ? "text-emerald-700" : "text-red-700"}`}>
                    {c.direction === "in" ? "příjem" : "výdaj"}
                  </span>
                  <input name="name" defaultValue={c.name} className={`${field} min-w-48 flex-1`} />
                  <RowSelect value={c.row} />
                  <select name="activity" defaultValue={c.activity} className={field}>
                    <option value="main">Hlavní</option>
                    <option value="side">Hospodářská</option>
                  </select>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="active" defaultChecked={c.active} /> používat
                  </label>
                  <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm">Uložit</button>
                </ActionForm>
              </li>
            ))}
        </ul>
        <h3 className="mt-3 mb-1 text-sm font-semibold">Nová kategorie</h3>
        <ActionForm action={saveCategory} className="flex flex-wrap items-center gap-2" resetOnOk>
          <input name="name" required placeholder="Název" className={`${field} min-w-48 flex-1`} />
          <RowSelect />
          <select name="activity" defaultValue="main" className={field}>
            <option value="main">Hlavní</option>
            <option value="side">Hospodářská</option>
          </select>
          <button className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Přidat</button>
        </ActionForm>
        <p className="mt-2 text-xs text-slate-500">Řádek „{rowLabel("A08")}“ používá jen převod pokladna ↔ účet.</p>
      </section>
    </div>
  );
}
