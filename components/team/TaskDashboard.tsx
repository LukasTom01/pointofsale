import Link from "next/link";
import { compareTasks, isDueSoon, isOverdue, type Now } from "@/lib/team/domain";
import { dueText } from "@/lib/team/format";
import type { Task } from "@/lib/team/types";

export const SOON_DAYS = 3;
const LIMIT = 8;

/** Přehled úkolů: otevřené po termínu a ty, kterým se blíží termín. */
export default function TaskDashboard({
  tasks,
  nameById,
  now,
}: {
  tasks: Task[];
  nameById: Map<string, string>;
  now: Now;
}) {
  const overdue = tasks.filter((t) => isOverdue(t, now)).sort(compareTasks);
  const soon = tasks.filter((t) => isDueSoon(t, now, SOON_DAYS)).sort(compareTasks);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Panel
        title="Po termínu"
        count={overdue.length}
        href="/admin/ukoly?po=1"
        tone="red"
        empty="Nic není po termínu. 👍"
        tasks={overdue}
        nameById={nameById}
        now={now}
      />
      <Panel
        title={`Termín do ${SOON_DAYS} dnů`}
        count={soon.length}
        href="/admin/ukoly?brzy=1"
        tone="amber"
        empty="V nejbližších dnech nic nekončí."
        tasks={soon}
        nameById={nameById}
        now={now}
      />
    </div>
  );
}

function Panel({
  title,
  count,
  href,
  tone,
  empty,
  tasks,
  nameById,
  now,
}: {
  title: string;
  count: number;
  href: string;
  tone: "red" | "amber";
  empty: string;
  tasks: Task[];
  nameById: Map<string, string>;
  now: Now;
}) {
  const accent = tone === "red" ? "border-red-500" : "border-amber-500";
  const badge = tone === "red" ? "bg-red-600 text-white" : "bg-amber-500 text-white";
  const dueColor = tone === "red" ? "text-red-600" : "text-amber-700";
  return (
    <section className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${accent}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          {title}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${count ? badge : "bg-slate-200 text-slate-600"}`}>{count}</span>
        </h2>
        {count > LIMIT ? (
          <Link href={href} className="text-xs text-slate-500 hover:underline">
            Zobrazit vše
          </Link>
        ) : null}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.slice(0, LIMIT).map((t) => {
            const names = t.assigneeIds.map((id) => nameById.get(id)).filter(Boolean);
            return (
              <li key={t.id}>
                <Link href={`/admin/ukoly#ukol-${t.id}`} className="flex items-baseline justify-between gap-3 py-1.5 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block truncate text-xs text-slate-500">{names.length ? names.join(", ") : "Nepřiřazeno"}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${dueColor}`}>{dueText(t.dueDate!, t.dueTime, now.day)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
