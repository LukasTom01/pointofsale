import Link from "next/link";
import { listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { addDays, coverageByHour, isDay, overlappingShiftIds, planDays, pragueToday, quickTimes, weekStart } from "@/lib/team/domain";
import { dayLabel, dayLong } from "@/lib/team/format";
import PlanGrid from "@/components/team/PlanGrid";
import { copyShift, deleteShift, saveShift } from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ od?: string; akce?: string; den?: string }>;
}) {
  const sp = await searchParams;
  const today = pragueToday();
  const [staff, events, roles, recent] = await Promise.all([
    listStaff(),
    teamStore.listEvents(),
    teamStore.listRoles(),
    teamStore.recentShiftTimes(),
  ]);
  const event = sp.akce ? (events.find((e) => e.id === sp.akce) ?? null) : null;
  const weekOf = sp.od && isDay(sp.od) ? sp.od : today;
  const days = planDays({ eventFrom: event?.dateFrom, eventTo: event?.dateTo, weekOf });
  const from = days[0];
  const to = days[days.length - 1];

  const shifts = await teamStore.listShifts({ from, to, eventId: event?.id ?? null });
  const overlap = overlappingShiftIds(shifts);
  const shiftStaff = new Set(shifts.map((s) => s.staffId));
  // Neaktivní lidé se ukážou jen tehdy, když už mají v období směnu.
  const people = staff.filter((s) => s.active || shiftStaff.has(s.id)).map((s) => ({ id: s.id, name: s.name }));

  const coverageDay = sp.den && days.includes(sp.den) ? sp.den : days.includes(today) ? today : from;
  const coverage = coverageByHour(shifts.filter((s) => s.day === coverageDay));
  const hours = [...coverage.values()].flatMap((row) => row.map((n, h) => (n > 0 ? h : -1))).filter((h) => h >= 0);
  const hourFrom = hours.length ? Math.min(...hours) : 8;
  const hourTo = hours.length ? Math.max(...hours) : 20;
  const roleName = (id: string | null) => (id ? (roles.find((r) => r.id === id)?.name ?? "—") : "Bez pozice");

  const week = weekStart(weekOf);
  const link = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    const s = q.toString();
    return `/admin/smeny${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Směny</h1>
        <form method="get" className="flex items-center gap-2 text-sm">
          <select name="akce" defaultValue={event?.id ?? ""} className="h-10 rounded-lg border border-slate-300 bg-white px-2">
            <option value="">Týdenní plán (všechny směny)</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button className="h-10 rounded-lg border border-slate-300 bg-white px-3">Zobrazit</button>
        </form>
      </div>

      {event ? (
        <p className="text-sm text-slate-600">
          Akce <strong>{event.name}</strong>
          {event.dateFrom ? "" : " nemá vyplněné datum – zobrazuji aktuální týden. Datum doplníte v sekci Akce."} Nové směny se přiřadí k této akci.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={link({ od: addDays(week, -7) })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
            ← Předchozí týden
          </Link>
          <Link href={link({})} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
            Tento týden
          </Link>
          <Link href={link({ od: addDays(week, 7) })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
            Další týden →
          </Link>
          <span className="text-slate-500">
            {dayLabel(from)} – {dayLabel(to)}
          </span>
        </div>
      )}

      {people.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Nejdřív přidejte lidi v sekci <Link href="/admin/lide" className="underline">Lidé</Link>.
        </p>
      ) : (
        <PlanGrid
          days={days.map((day) => ({ day, label: dayLabel(day) }))}
          people={people}
          shifts={shifts.map((s) => ({
            id: s.id,
            staffId: s.staffId,
            day: s.day,
            startMin: s.startMin,
            endMin: s.endMin,
            roleId: s.roleId,
            note: s.note,
            overlap: overlap.has(s.id),
          }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
          quickTimes={quickTimes(recent)}
          eventId={event?.id ?? null}
          actions={{ save: saveShift, remove: deleteShift, copy: copyShift }}
        />
      )}
      {overlap.size > 0 ? (
        <p className="text-sm text-red-600">⚠ Některé směny se u stejného člověka překrývají (červeně orámované).</p>
      ) : null}

      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Obsazení po hodinách – {dayLong(coverageDay)}</h2>
          <div className="flex flex-wrap gap-1 text-xs">
            {days.map((d) => (
              <Link
                key={d}
                href={link({ od: event ? undefined : sp.od, akce: event?.id, den: d })}
                className={`rounded-full border px-2 py-0.5 ${d === coverageDay ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
              >
                {dayLabel(d)}
              </Link>
            ))}
          </div>
        </div>
        {coverage.size === 0 ? (
          <p className="text-sm text-slate-500">Tento den nikdo nemá směnu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs tabular-nums">
              <thead>
                <tr className="text-slate-500">
                  <th className="pr-3 text-left font-medium">Pozice</th>
                  {Array.from({ length: hourTo - hourFrom + 1 }, (_, i) => hourFrom + i).map((h) => (
                    <th key={h} className="w-8 text-center font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...coverage.entries()].map(([roleId, row]) => (
                  <tr key={roleId ?? "none"}>
                    <td className="pr-3 py-0.5 whitespace-nowrap">{roleName(roleId)}</td>
                    {row.slice(hourFrom, hourTo + 1).map((n, i) => (
                      <td key={i} className={`text-center ${n === 0 ? "text-slate-300" : "bg-emerald-100 font-semibold"}`}>
                        {n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
