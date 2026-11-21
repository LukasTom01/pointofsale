import Link from "next/link";
import { teamStore } from "@/lib/team/store";
import { dayShort } from "@/lib/team/format";
import ActionForm from "@/components/team/ActionForm";
import { deleteEvent, deleteRole, saveEvent, saveRole } from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

const input = "mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export default async function EventsPage() {
  const [events, roles] = await Promise.all([teamStore.listEvents(), teamStore.listRoles()]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <div>
          <h1 className="text-xl font-bold">Akce</h1>
          <p className="text-sm text-slate-500">Nepovinné – seskupí úkoly a směny jedné akce (festival, trh…).</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <ActionForm action={saveEvent} className="flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 text-xs text-slate-500">
              Název
              <input name="name" required maxLength={120} className={`${input} w-full`} />
            </label>
            <label className="text-xs text-slate-500">
              Od
              <input name="dateFrom" type="date" className={input} />
            </label>
            <label className="text-xs text-slate-500">
              Do
              <input name="dateTo" type="date" className={input} />
            </label>
            <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Přidat akci</button>
          </ActionForm>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Zatím žádné akce.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-xs text-slate-500">
                    {e.dateFrom ? `${dayShort(e.dateFrom)}${e.dateTo && e.dateTo !== e.dateFrom ? ` – ${dayShort(e.dateTo)}` : ""}` : "bez data"}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  <Link href={`/admin/smeny?akce=${e.id}`} className="text-slate-600 underline">
                    Směny
                  </Link>
                  <Link href={`/admin/ukoly?akce=${e.id}`} className="text-slate-600 underline">
                    Úkoly
                  </Link>
                  <Link href={`/admin/dochazka/souhrn?akce=${e.id}`} className="text-slate-600 underline">
                    Souhrn hodin
                  </Link>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500">Upravit</summary>
                  <ActionForm action={saveEvent} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="eventId" value={e.id} />
                    <input name="name" required defaultValue={e.name} aria-label="Název" className={`${input} min-w-40 flex-1`} />
                    <input name="dateFrom" type="date" defaultValue={e.dateFrom ?? ""} aria-label="Od" className={input} />
                    <input name="dateTo" type="date" defaultValue={e.dateTo ?? ""} aria-label="Do" className={input} />
                    <button className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Uložit</button>
                  </ActionForm>
                  <form action={deleteEvent} className="mt-2">
                    <input type="hidden" name="eventId" value={e.id} />
                    <button className="text-xs text-red-600 hover:underline">
                      Smazat akci (úkoly a směny zůstanou, jen bez akce)
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Pozice</h2>
          <p className="text-sm text-slate-500">Kde člověk na směně stojí (bar, kasa, kuchyně…). Barva se ukáže v plánu.</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <ActionForm action={saveRole} className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 text-xs text-slate-500">
              Název
              <input name="name" required maxLength={60} className={`${input} w-full`} />
            </label>
            <label className="text-xs text-slate-500">
              Barva
              <input name="color" type="color" defaultValue="#94a3b8" className={`${input} w-14 p-1`} />
            </label>
            <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Přidat pozici</button>
          </ActionForm>
        </div>
        {roles.length === 0 ? (
          <p className="text-sm text-slate-500">Zatím žádné pozice.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
            {roles.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 p-3">
                <ActionForm action={saveRole} className="flex flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="roleId" value={r.id} />
                  <input name="color" type="color" defaultValue={r.color ?? "#94a3b8"} aria-label="Barva" className="h-9 w-10 rounded border border-slate-300 p-0.5" />
                  <input name="name" required defaultValue={r.name} aria-label="Název" className="h-9 min-w-32 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
                  <button className="h-9 rounded-lg border border-slate-300 px-3 text-sm">Uložit</button>
                </ActionForm>
                <form action={deleteRole}>
                  <input type="hidden" name="roleId" value={r.id} />
                  <button className="h-9 rounded-lg px-2 text-sm text-red-600 hover:bg-red-50">Smazat</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
