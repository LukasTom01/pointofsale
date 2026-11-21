import Link from "next/link";
import { listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { compareTasks, isOverdue, isTaskStatus, pragueToday } from "@/lib/team/domain";
import { dayShort } from "@/lib/team/format";
import type { TaskStatus } from "@/lib/team/types";
import ActionForm from "@/components/team/ActionForm";
import AssigneePicker from "@/components/team/AssigneePicker";
import { createTask, deleteTask, toggleTaskDone, updateTask } from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<TaskStatus, string> = { todo: "K řešení", doing: "Rozpracováno", done: "Hotovo" };
const input = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ stav?: string; kdo?: string; akce?: string; po?: string }>;
}) {
  const sp = await searchParams;
  const [staff, events, all] = await Promise.all([listStaff(), teamStore.listEvents(), teamStore.listTasks()]);
  const people = staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  const eventById = new Map(events.map((e) => [e.id, e.name]));
  const today = pragueToday();

  // Výchozí pohled: otevřené úkoly; „vše“ ukáže i hotové.
  const stav = sp.stav === "vse" || (sp.stav && isTaskStatus(sp.stav)) ? sp.stav : "otevrene";
  const tasks = all
    .filter((t) => (stav === "otevrene" ? t.status !== "done" : stav === "vse" ? true : t.status === stav))
    .filter((t) => (sp.kdo ? (sp.kdo === "nikdo" ? t.assigneeIds.length === 0 : t.assigneeIds.includes(sp.kdo)) : true))
    .filter((t) => (sp.akce ? t.eventId === sp.akce : true))
    .filter((t) => (sp.po ? isOverdue(t, today) : true))
    .sort(compareTasks);
  const overdueCount = all.filter((t) => isOverdue(t, today)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Úkoly</h1>
        {overdueCount > 0 ? (
          <Link href="/admin/ukoly?po=1" className="text-sm font-medium text-red-600 hover:underline">
            Po termínu: {overdueCount}
          </Link>
        ) : null}
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <ActionForm action={createTask} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input name="title" required maxLength={200} placeholder="Co je potřeba udělat?" className={`${input} min-w-60 flex-1 text-base`} />
            <input name="dueDate" type="date" aria-label="Termín" className={input} />
            {events.length > 0 ? (
              <select name="eventId" aria-label="Akce" className={input} defaultValue={sp.akce ?? ""}>
                <option value="">— bez akce —</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Přidat úkol</button>
          </div>
          {people.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Kdo to udělá (nepovinné)</p>
              <AssigneePicker people={people} />
            </div>
          ) : null}
          <details>
            <summary className="cursor-pointer text-xs text-slate-500">Přidat poznámku</summary>
            <textarea name="note" rows={3} maxLength={4000} className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </details>
        </ActionForm>
      </section>

      <form className="flex flex-wrap items-center gap-2 text-sm" method="get">
        <select name="stav" defaultValue={stav} className={input}>
          <option value="otevrene">Otevřené</option>
          <option value="todo">K řešení</option>
          <option value="doing">Rozpracováno</option>
          <option value="done">Hotovo</option>
          <option value="vse">Vše</option>
        </select>
        <select name="kdo" defaultValue={sp.kdo ?? ""} className={input}>
          <option value="">Kdokoli</option>
          <option value="nikdo">Nepřiřazené</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {events.length > 0 ? (
          <select name="akce" defaultValue={sp.akce ?? ""} className={input}>
            <option value="">Všechny akce</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="po" value="1" defaultChecked={Boolean(sp.po)} /> jen po termínu
        </label>
        <button className="h-10 rounded-lg border border-slate-300 bg-white px-3">Filtrovat</button>
        <Link href="/admin/ukoly" className="text-slate-500 hover:underline">
          Zrušit filtr
        </Link>
      </form>

      {tasks.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Žádné úkoly.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
          {tasks.map((task) => {
            const overdue = isOverdue(task, today);
            const names = task.assigneeIds.map((id) => nameById.get(id)).filter(Boolean);
            return (
              <li key={task.id} className="p-3">
                <div className="flex items-start gap-3">
                  <form action={toggleTaskDone}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      aria-label={task.status === "done" ? "Vrátit mezi otevřené" : "Označit jako hotové"}
                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border-2 text-sm ${
                        task.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {task.status === "done" ? "✓" : ""}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${task.status === "done" ? "text-slate-400 line-through" : ""}`}>{task.title}</p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {task.status === "doing" ? <span className="font-medium text-amber-700">Rozpracováno</span> : null}
                      {task.dueDate ? (
                        <span className={overdue ? "font-semibold text-red-600" : ""}>
                          {overdue ? "Po termínu · " : "Termín "}
                          {dayShort(task.dueDate)}
                        </span>
                      ) : null}
                      <span>{names.length ? names.join(", ") : "Nepřiřazeno"}</span>
                      {task.eventId && eventById.get(task.eventId) ? <span>{eventById.get(task.eventId)}</span> : null}
                    </p>
                    {task.note ? <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{task.note}</p> : null}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">Upravit</summary>
                      <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
                        <ActionForm action={updateTask} className="space-y-2">
                          <input type="hidden" name="taskId" value={task.id} />
                          <input name="title" required defaultValue={task.title} maxLength={200} className={`${input} w-full`} />
                          <div className="flex flex-wrap gap-2">
                            <select name="status" defaultValue={task.status} className={input}>
                              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <input name="dueDate" type="date" defaultValue={task.dueDate ?? ""} aria-label="Termín" className={input} />
                            <select name="eventId" defaultValue={task.eventId ?? ""} aria-label="Akce" className={input}>
                              <option value="">— bez akce —</option>
                              {events.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <AssigneePicker people={people} defaultSelected={task.assigneeIds} />
                          <textarea
                            name="note"
                            rows={3}
                            defaultValue={task.note ?? ""}
                            maxLength={4000}
                            placeholder="Poznámka"
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Uložit</button>
                        </ActionForm>
                        <ActionForm action={deleteTask} confirm={`Smazat úkol „${task.title}“?`}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <button className="text-sm text-red-600 hover:underline">Smazat úkol</button>
                        </ActionForm>
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
