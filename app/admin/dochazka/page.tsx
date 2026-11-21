import Link from "next/link";
import { listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { actualMinutes, addDays, formatRange, isDay, pragueClock, pragueToday, timeInput } from "@/lib/team/domain";
import { dayLong, hoursText } from "@/lib/team/format";
import type { Attendance } from "@/lib/team/types";
import ActionForm from "@/components/team/ActionForm";
import { setAttendance, setShiftTimes } from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

const BADGE: Record<Attendance, { label: string; cls: string }> = {
  planned: { label: "Čeká se", cls: "bg-slate-100 text-slate-600" },
  present: { label: "Přišel/a", cls: "bg-emerald-100 text-emerald-800" },
  absent: { label: "Nepřišel/a", cls: "bg-red-100 text-red-700" },
};

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const today = pragueToday();
  const day = sp.d && isDay(sp.d) ? sp.d : today;
  const [staff, roles, shifts] = await Promise.all([
    listStaff(),
    teamStore.listRoles(),
    teamStore.listShifts({ from: day, to: day }),
  ]);
  const nameById = new Map(staff.map((s) => [s.id, s.name]));

  // Seskupení podle pozice v pořadí pozic, „Bez pozice“ na konec.
  const groups = [...roles.map((r) => ({ id: r.id as string | null, name: r.name })), { id: null, name: "Bez pozice" }]
    .map((g) => ({ ...g, shifts: shifts.filter((s) => (s.roleId ?? null) === g.id) }))
    .filter((g) => g.shifts.length > 0);
  const present = shifts.filter((s) => s.attendance === "present").length;
  const absent = shifts.filter((s) => s.attendance === "absent").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Docházka</h1>
        <Link href="/admin/dochazka/souhrn" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
          Souhrn hodin a výkaz →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/admin/dochazka?d=${addDays(day, -1)}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
          ←
        </Link>
        <form method="get">
          <input type="date" name="d" defaultValue={day} className="h-9 rounded-lg border border-slate-300 bg-white px-2" />
          <button className="ml-1 h-9 rounded-lg border border-slate-300 bg-white px-3">Zobrazit</button>
        </form>
        <Link href={`/admin/dochazka?d=${addDays(day, 1)}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
          →
        </Link>
        {day !== today ? (
          <Link href="/admin/dochazka" className="text-slate-500 hover:underline">
            Dnes
          </Link>
        ) : null}
      </div>

      <p className="text-sm text-slate-600">
        <strong>{dayLong(day)}</strong> · směn {shifts.length} · přišlo {present}
        {absent ? ` · nepřišlo ${absent}` : ""}
      </p>

      {groups.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Na tento den nejsou naplánované žádné směny. Naplánujete je v sekci{" "}
          <Link href="/admin/smeny" className="underline">
            Směny
          </Link>
          .
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.id ?? "none"} className="rounded-xl bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{group.name}</h2>
            <ul className="divide-y divide-slate-100">
              {group.shifts.map((s) => {
                const badge = BADGE[s.attendance];
                const worked = actualMinutes(s.checkInAt, s.checkOutAt);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{nameById.get(s.staffId) ?? "?"}</p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        plán {formatRange(s.startMin, s.endMin)}
                        {s.checkInAt ? ` · příchod ${pragueClock(s.checkInAt)}` : ""}
                        {s.checkOutAt ? ` · odchod ${pragueClock(s.checkOutAt)}` : ""}
                        {worked != null ? ` · ${hoursText(worked)}` : ""}
                      </p>
                      {s.note ? <p className="text-xs text-slate-500">{s.note}</p> : null}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                    <div className="flex gap-1">
                      {(["present", "absent", "planned"] as Attendance[])
                        .filter((a) => a !== s.attendance)
                        .map((a) => (
                          <form key={a} action={setAttendance}>
                            <input type="hidden" name="shiftId" value={s.id} />
                            <input type="hidden" name="attendance" value={a} />
                            <button
                              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                                a === "present"
                                  ? "bg-emerald-600 text-white"
                                  : a === "absent"
                                    ? "border border-red-300 text-red-700"
                                    : "border border-slate-300 text-slate-600"
                              }`}
                            >
                              {a === "present" ? "Přišel/a" : a === "absent" ? "Nepřišel/a" : "Zpět na plán"}
                            </button>
                          </form>
                        ))}
                    </div>
                    <details className="w-full">
                      <summary className="cursor-pointer text-xs text-slate-500">Upravit příchod / odchod</summary>
                      <ActionForm action={setShiftTimes} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="shiftId" value={s.id} />
                        <label className="text-xs text-slate-500">
                          Příchod
                          <input
                            name="arrived"
                            type="time"
                            required
                            defaultValue={s.checkInAt ? pragueClock(s.checkInAt).padStart(5, "0") : timeInput(s.startMin)}
                            className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Odchod
                          <input
                            name="left"
                            type="time"
                            defaultValue={s.checkOutAt ? pragueClock(s.checkOutAt).padStart(5, "0") : ""}
                            className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm"
                          />
                        </label>
                        <button className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Uložit</button>
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
