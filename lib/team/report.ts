// Data pro souhrn docházky a výkaz hodin (stránka i export do Excelu).
import { listStaff } from "@/lib/store";
import { teamStore } from "./store";
import { attendanceTotals, pragueToday, reportPeriod } from "./domain";

export async function loadReport(sp: { od?: string; do?: string; akce?: string }) {
  const [staff, events, roles] = await Promise.all([listStaff(), teamStore.listEvents(), teamStore.listRoles()]);
  const event = sp.akce ? (events.find((e) => e.id === sp.akce) ?? null) : null;
  const period = reportPeriod(sp, pragueToday(), event);
  const shifts = await teamStore.listShifts({ ...period, eventId: event?.id ?? null });
  const totals = attendanceTotals(shifts);
  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  const rows = [...totals.values()]
    .map((t) => ({ ...t, name: nameById.get(t.staffId) ?? "?" }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  return { events, event, period, shifts, rows, nameById, roleName };
}
