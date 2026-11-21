import { listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import StaffAdmin from "@/components/StaffAdmin";
import ActionForm from "@/components/team/ActionForm";
import CopyLinkButton from "@/components/team/CopyLinkButton";
import { saveProfile, setPersonalLink } from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

export default async function LidePage() {
  const [staff, profiles] = await Promise.all([listStaff(), teamStore.listProfiles()]);
  const profileById = new Map(profiles.map((p) => [p.staffId, p]));

  return (
    <div className="space-y-8">
      <StaffAdmin initialStaff={staff} />

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Kontakty a osobní odkazy</h2>
          <p className="text-sm text-slate-500">
            Osobní odkaz otevře člověku jeho směny a úkoly – bez registrace a hesla. Pošlete ho třeba přes WhatsApp; kdo ho má,
            vidí jen svůj přehled. Při úniku odkaz vygenerujte znovu (starý přestane platit) nebo ho zrušte.
          </p>
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-slate-500">Nejdřív přidejte lidi výše.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
            {staff.map((person) => {
              const profile = profileById.get(person.id);
              const path = profile?.token ? `/muj/${profile.token}` : null;
              return (
                <li key={person.id} className="flex flex-wrap items-start gap-3 p-3">
                  <p className={`w-40 pt-2 font-medium ${person.active ? "" : "text-slate-400"}`}>{person.name}</p>
                  <ActionForm action={saveProfile} className="flex flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="staffId" value={person.id} />
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={profile?.phone ?? ""}
                      placeholder="Telefon"
                      aria-label="Telefon"
                      className="h-9 w-40 rounded-lg border border-slate-300 px-2 text-sm"
                    />
                    <input
                      name="note"
                      defaultValue={profile?.note ?? ""}
                      placeholder="Poznámka (např. jen víkendy)"
                      aria-label="Poznámka"
                      className="h-9 min-w-40 flex-1 rounded-lg border border-slate-300 px-2 text-sm"
                    />
                    <button className="h-9 rounded-lg border border-slate-300 px-3 text-sm">Uložit</button>
                  </ActionForm>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {path ? (
                      <>
                        <a href={path} target="_blank" rel="noreferrer" className="text-xs text-slate-600 underline">
                          Otevřít
                        </a>
                        <CopyLinkButton path={path} />
                      </>
                    ) : null}
                    <form action={setPersonalLink}>
                      <input type="hidden" name="staffId" value={person.id} />
                      <input type="hidden" name="mode" value="new" />
                      <button className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">
                        {path ? "Nový odkaz" : "Vytvořit odkaz"}
                      </button>
                    </form>
                    {path ? (
                      <form action={setPersonalLink}>
                        <input type="hidden" name="staffId" value={person.id} />
                        <input type="hidden" name="mode" value="revoke" />
                        <button className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50">Zrušit</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
