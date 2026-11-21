import Link from "next/link";
import { staffTaskStats, type Now } from "@/lib/team/domain";
import type { Task } from "@/lib/team/types";

/** Přehled po lidech: kolik má kdo otevřeno, po termínu, ke kontrole a hotovo (včas). */
export default function StaffTaskTable({ tasks, people, now }: { tasks: Task[]; people: { id: string; name: string }[]; now: Now }) {
  const stats = staffTaskStats(tasks, people.map((p) => p.id), now);
  const rows = people.map((p) => ({ ...p, ...stats.get(p.id)! })).filter((r) => r.open + r.done + r.review > 0);
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, "cs"));
  return (
    <details className="rounded-xl bg-white p-4 shadow-sm" open>
      <summary className="cursor-pointer font-semibold">Lidé a jejich úkoly</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Kdo</th>
              <th className="px-2 py-1 text-right font-medium">Otevřené</th>
              <th className="px-2 py-1 text-right font-medium">Po termínu</th>
              <th className="px-2 py-1 text-right font-medium">Ke kontrole</th>
              <th className="px-2 py-1 text-right font-medium">Problémy</th>
              <th className="px-2 py-1 text-right font-medium">Hotovo</th>
              <th className="px-2 py-1 text-right font-medium">Včas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-3">
                  <Link href={`/admin/ukoly?kdo=${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 text-right">{r.open}</td>
                <td className={`px-2 text-right ${r.overdue ? "font-bold text-red-600" : "text-slate-400"}`}>{r.overdue}</td>
                <td className={`px-2 text-right ${r.review ? "text-sky-700" : "text-slate-400"}`}>{r.review}</td>
                <td className={`px-2 text-right ${r.problems ? "font-bold text-red-600" : "text-slate-400"}`}>{r.problems}</td>
                <td className="px-2 text-right">{r.done}</td>
                <td className="px-2 text-right text-slate-600">{r.withDue ? `${Math.round((r.onTime / r.withDue) * 100)} %` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
