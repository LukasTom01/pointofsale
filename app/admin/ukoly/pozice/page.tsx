import Link from "next/link";
import { teamStore } from "@/lib/team/store";
import { whenText } from "@/lib/team/format";
import type { RoleTask } from "@/lib/team/types";
import ActionForm from "@/components/team/ActionForm";
import TaskOptions, { REMIND_OPTIONS } from "@/components/team/TaskOptions";
import { deleteRoleTask, saveRoleTask } from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

const input = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

function Fields({ t, roles }: { t?: RoleTask; roles: { id: string; name: string }[] }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <select name="roleId" required defaultValue={t?.roleId ?? ""} className={input} aria-label="Pozice">
          <option value="" disabled>
            Pozice…
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input name="title" required maxLength={200} defaultValue={t?.title} placeholder="Co udělat (např. Otevřít stánek)" className={`${input} min-w-60 flex-1`} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Termín:</span>
        <input
          name="offsetMin"
          type="number"
          step={5}
          min={-720}
          max={720}
          defaultValue={t?.offsetMin ?? 0}
          className={`${input} w-24`}
          aria-label="Posun v minutách"
        />
        <span className="text-slate-600">min vůči</span>
        <select name="anchor" defaultValue={t?.anchor ?? "start"} className={input} aria-label="Vůči čemu">
          <option value="start">začátku směny</option>
          <option value="end">konci směny</option>
        </select>
        <span className="text-xs text-slate-500">(záporné číslo = před, např. −30 před koncem)</span>
      </div>
      <textarea name="note" rows={2} maxLength={4000} defaultValue={t?.note ?? ""} placeholder="Poznámka / návod (nepovinné)" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
      <TaskOptions showCompletion={false} defaults={t ? { ...t, checklist: t.checklist } : undefined} />
    </>
  );
}

export default async function RoleTasksPage() {
  const [roles, templates] = await Promise.all([teamStore.listRoles(), teamStore.listRoleTasks()]);
  const remindLabel = (m: number | null) => REMIND_OPTIONS.find((o) => o.value === (m == null ? "" : String(m)))?.label ?? `${m} min předem`;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ukoly" className="text-sm text-slate-500 hover:underline">
          ← Úkoly
        </Link>
        <h1 className="text-xl font-bold">Úkoly pozic</h1>
        <p className="text-sm text-slate-600">
          Kdo má naplánovanou směnu s danou pozicí, dostane tyto úkoly automaticky – s termínem podle začátku nebo konce své směny.
          Uvidí je přímo u dnešní směny. Změny se promítnou do dnešních a budoucích směn (rozdělaných úkolů se to nedotkne).
        </p>
      </div>

      {roles.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          Nejdřív si v sekci <Link href="/admin/akce" className="underline">Akce</Link> založte pozice (např. Pokladna, Bar, Sklad).
        </p>
      ) : (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold">Nový úkol pozice</h2>
            <ActionForm action={saveRoleTask} className="space-y-3" resetOnOk>
              <Fields roles={roles} />
              <button className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white">Přidat</button>
            </ActionForm>
          </section>

          {roles.map((role) => {
            const list = templates.filter((t) => t.roleId === role.id);
            return (
              <section key={role.id} className="rounded-xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 flex items-center gap-2 font-semibold">
                  {role.color ? <span className="h-3 w-3 rounded-full" style={{ background: role.color }} /> : null}
                  {role.name}
                  <span className="text-xs font-normal text-slate-500">{list.length ? `${list.length} úkolů` : "zatím bez úkolů"}</span>
                </h2>
                {list.length ? (
                  <ul className="divide-y divide-slate-100">
                    {list.map((t) => (
                      <li key={t.id} className="py-2">
                        <p className="font-medium">{t.title}</p>
                        <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                          <span>{whenText(t)}</span>
                          {t.remindMin != null ? <span>🔔 {remindLabel(t.remindMin)}</span> : null}
                          {t.checklist.length ? <span>☑ {t.checklist.length} bodů</span> : null}
                          {t.requiresPhoto ? <span>📷 s fotkou</span> : null}
                          {t.requiresReview ? <span>👀 kontrola</span> : null}
                        </p>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">Upravit</summary>
                          <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
                            <ActionForm action={saveRoleTask} className="space-y-3">
                              <input type="hidden" name="roleTaskId" value={t.id} />
                              <Fields t={t} roles={roles} />
                              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Uložit</button>
                            </ActionForm>
                            <ActionForm action={deleteRoleTask} confirm={`Smazat úkol pozice „${t.title}“? Nezačaté úkoly ve směnách zmizí.`}>
                              <input type="hidden" name="roleTaskId" value={t.id} />
                              <button className="text-sm text-red-600 hover:underline">Smazat</button>
                            </ActionForm>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
