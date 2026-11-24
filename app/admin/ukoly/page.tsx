import Link from "next/link";
import { listStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { compareTasks, isDueSoon, isOverdue, isTaskStatus, pragueClock, pragueNow, pragueToday, timeInput } from "@/lib/team/domain";
import { dayLabel, dueText } from "@/lib/team/format";
import { sizeText } from "@/lib/team/attachments";
import { pushConfigured, vapidPublicKey } from "@/lib/team/push";
import { tickSoon } from "@/lib/team/notify";
import type { TaskAttachment, TaskLogEntry, TaskLogKind, TaskStatus } from "@/lib/team/types";
import ActionForm from "@/components/team/ActionForm";
import { ConfirmButton, SelectAll } from "@/components/team/BulkControls";
import AssigneePicker from "@/components/team/AssigneePicker";
import AttachmentInput from "@/components/team/AttachmentInput";
import PushToggle from "@/components/team/PushToggle";
import StaffTaskTable from "@/components/team/StaffTaskTable";
import TaskDashboard, { SOON_DAYS } from "@/components/team/TaskDashboard";
import TaskInbox from "@/components/team/TaskInbox";
import TaskOptions from "@/components/team/TaskOptions";
import {
  bulkTasks,
  createTask,
  deleteAttachment,
  deleteTask,
  removeAdminPush,
  saveAdminPush,
  toggleTaskDone,
  updateTask,
} from "@/app/admin/tym/actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<TaskStatus, string> = { todo: "K řešení", doing: "Rozpracováno", review: "Ke kontrole", done: "Hotovo" };
const LOG_LABEL: Record<TaskLogKind, string> = {
  created: "vytvořil/a",
  edited: "upravil/a",
  done: "odškrtl/a",
  undone: "vrátil/a odškrtnutí",
  review: "poslal/a ke kontrole",
  approved: "schválil/a",
  returned: "vrátil/a k dopracování",
  problem: "nahlásil/a problém",
  resolved: "vyřešil/a problém",
  photo: "nahrál/a fotku",
  check: "odškrtl/a bod",
  uncheck: "zrušil/a bod",
  copied: "zkopíroval/a z úkolu",
};
const input = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ stav?: string; kdo?: string; akce?: string; po?: string; brzy?: string; problem?: string }>;
}) {
  const sp = await searchParams;
  tickSoon();
  const [staff, events, all, attachments, history] = await Promise.all([
    listStaff(),
    teamStore.listEvents(),
    teamStore.listTasks(),
    teamStore.listAttachments(),
    teamStore.listTaskLog(),
  ]);
  const people = staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  const eventById = new Map(events.map((e) => [e.id, e.name]));
  const filesByTask = new Map<string, TaskAttachment[]>();
  for (const a of attachments) filesByTask.set(a.taskId, [...(filesByTask.get(a.taskId) ?? []), a]);
  const logByTask = new Map<string, TaskLogEntry[]>();
  for (const e of history) logByTask.set(e.taskId, [...(logByTask.get(e.taskId) ?? []), e]);
  const now = pragueNow();
  const publicKey = pushConfigured() ? vapidPublicKey() : null;

  // Výchozí pohled: otevřené úkoly (vč. ke kontrole); „vše“ ukáže i hotové.
  const stav = sp.stav === "vse" || (sp.stav && isTaskStatus(sp.stav)) ? sp.stav : "otevrene";
  const tasks = all
    .filter((t) => (stav === "otevrene" ? t.status !== "done" : stav === "vse" ? true : t.status === stav))
    .filter((t) => (sp.kdo ? (sp.kdo === "nikdo" ? t.assigneeIds.length === 0 : t.assigneeIds.includes(sp.kdo)) : true))
    .filter((t) => (sp.akce ? t.eventId === sp.akce : true))
    .filter((t) => (sp.po ? isOverdue(t, now) : true))
    .filter((t) => (sp.brzy ? isDueSoon(t, now, SOON_DAYS) : true))
    .filter((t) => (sp.problem ? Boolean(t.problem) : true))
    .sort(compareTasks);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Úkoly</h1>
        <Link href="/admin/ukoly/pozice" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          Úkoly pozic (automaticky ke směnám) →
        </Link>
      </div>

      {publicKey ? (
        <PushToggle publicKey={publicKey} onSave={saveAdminPush} onRemove={removeAdminPush} variant="admin" />
      ) : (
        <p className="rounded-lg bg-slate-200/60 px-3 py-2 text-xs text-slate-600">
          Push notifikace nejsou nastavené – doplňte VAPID klíče (viz docs/tym.md). Bez nich vše funguje, jen nechodí upozornění.
        </p>
      )}

      <TaskInbox tasks={all} nameById={nameById} attachments={attachments} />
      <TaskDashboard tasks={all} nameById={nameById} now={now} />
      <StaffTaskTable tasks={all} people={people} now={now} />

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Nový úkol</h2>
        <ActionForm action={createTask} className="space-y-3" resetOnOk>
          <div className="flex flex-wrap gap-2">
            <input name="title" required maxLength={200} placeholder="Co je potřeba udělat?" className={`${input} min-w-60 flex-1 text-base`} />
            <input name="dueDate" type="date" aria-label="Termín – den" className={input} />
            <input name="dueTime" type="time" aria-label="Termín – čas (nepovinné)" className={input} />
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
          </div>
          <p className="-mt-1 text-xs text-slate-500">Termín: den a volitelně čas. Bez času platí do konce dne (připomínka pak přijde v 8:00).</p>
          {people.length > 0 ? <AssigneePicker people={people} /> : null}
          <textarea name="note" rows={2} maxLength={4000} placeholder="Poznámka (nepovinné)" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
          <TaskOptions />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <AttachmentInput />
            <button className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white">Přidat úkol</button>
          </div>
        </ActionForm>
      </section>

      <form className="flex flex-wrap items-center gap-2 text-sm" method="get">
        <select name="stav" defaultValue={stav} className={input}>
          <option value="otevrene">Otevřené</option>
          <option value="todo">K řešení</option>
          <option value="doing">Rozpracováno</option>
          <option value="review">Ke kontrole</option>
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
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="brzy" value="1" defaultChecked={Boolean(sp.brzy)} /> termín do {SOON_DAYS} dnů
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="problem" value="1" defaultChecked={Boolean(sp.problem)} /> s problémem
        </label>
        <button className="h-10 rounded-lg border border-slate-300 bg-white px-3">Filtrovat</button>
        <Link href="/admin/ukoly" className="text-slate-500 hover:underline">
          Zrušit filtr
        </Link>
      </form>

      {/* Hromadné akce: políčka u úkolů patří k tomuto formuláři (atribut form). */}
      <ActionForm id="bulk" action={bulkTasks} className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <SelectAll form="bulk" />
          <span className="font-medium">Vybrané úkoly:</span>
          <label className="flex items-center gap-1.5">
            zkopírovat na den
            <input name="copyDay" type="date" className={input} />
          </label>
          {events.length > 0 ? (
            <select name="copyEvent" defaultValue="keep" className={input} aria-label="Akce kopie">
              <option value="keep">akce beze změny</option>
              <option value="">— bez akce —</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : null}
          <button name="op" value="copy" className="h-10 rounded-lg bg-slate-900 px-4 font-semibold text-white">
            Zkopírovat
          </button>
          <ConfirmButton name="op" value="delete" message="Opravdu smazat všechny vybrané úkoly?" className="h-10 rounded-lg border border-red-300 px-3 text-red-700">
            Smazat vybrané
          </ConfirmButton>
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-slate-500">Kopii přiřadit jiným lidem (jinak stejní lidé)</summary>
          <div className="mt-2">
            {people.length ? <AssigneePicker people={people} name="copyAssignee" /> : null}
          </div>
        </details>
        <p className="text-xs text-slate-500">
          Zaškrtněte úkoly v seznamu níže. Nejdřívější termín výběru se posune na zvolený den, ostatní si drží odstup (bez dne zůstanou
          termíny stejné). Kopírují se i checklist, volby a přílohy.
        </p>
      </ActionForm>

      {tasks.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Žádné úkoly.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
          {tasks.map((task) => {
            const overdue = isOverdue(task, now);
            const soon = isDueSoon(task, now, SOON_DAYS);
            const files = filesByTask.get(task.id) ?? [];
            const adminFiles = files.filter((f) => f.staffId == null);
            const photos = files.filter((f) => f.staffId != null);
            const each = task.completion === "each" && task.assigneeIds.length > 1;
            const checked = task.checklist.filter((i) => i.doneAt).length;
            const log = logByTask.get(task.id) ?? [];
            return (
              <li key={task.id} id={`ukol-${task.id}`} className="scroll-mt-4 p-3 target:bg-amber-50">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    form="bulk"
                    name="sel"
                    value={task.id}
                    aria-label="Vybrat pro hromadnou akci"
                    className="mt-1.5 h-4 w-4"
                  />
                  <form action={toggleTaskDone}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      aria-label={task.status === "done" ? "Vrátit mezi otevřené" : "Označit jako hotové (za všechny)"}
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
                      {task.status === "review" ? <span className="font-medium text-sky-700">👀 Ke kontrole</span> : null}
                      {task.problem ? <span className="font-semibold text-red-600">⚠️ {task.problem.reason}</span> : null}
                      {task.dueDate ? (
                        <span className={overdue ? "font-semibold text-red-600" : soon ? "font-semibold text-amber-700" : ""}>
                          {overdue ? "Po termínu · " : "Termín "}
                          {dueText(task.dueDate, task.dueTime, now.day)}
                        </span>
                      ) : null}
                      <span>
                        {task.assigneeIds.length
                          ? task.assigneeIds.map((id, i) => (
                              <span key={id} className={each && task.doneBy.includes(id) ? "text-emerald-700" : ""}>
                                {i > 0 ? ", " : ""}
                                {each && task.doneBy.includes(id) ? "✓ " : ""}
                                {nameById.get(id) ?? "?"}
                              </span>
                            ))
                          : "Nepřiřazeno"}
                        {each ? ` (${task.assigneeIds.filter((id) => task.doneBy.includes(id)).length}/${task.assigneeIds.length})` : ""}
                      </span>
                      {task.eventId && eventById.get(task.eventId) ? <span>{eventById.get(task.eventId)}</span> : null}
                      {task.checklist.length ? <span>☑ {checked}/{task.checklist.length}</span> : null}
                      {task.requiresPhoto ? <span>📷 s fotkou</span> : null}
                      {task.requiresReview ? <span>👀 kontrola</span> : null}
                      {task.remindMin != null && task.dueDate ? <span>🔔</span> : null}
                      {task.templateId ? <span>⚙ z pozice</span> : null}
                      {adminFiles.length ? <span>📎 {adminFiles.length}</span> : null}
                    </p>
                    {task.adminNote && task.status !== "done" ? (
                      <p className="mt-1 text-xs text-amber-800">💬 {task.adminNote}</p>
                    ) : null}
                    {task.note ? <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{task.note}</p> : null}
                    {task.checklist.length ? (
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {task.checklist.map((i) => (
                          <li key={i.id} className={i.doneAt ? "text-slate-400 line-through" : ""}>
                            {i.doneAt ? "☑" : "☐"} {i.text}
                            {i.doneAt && i.doneBy ? (
                              <span className="ml-1 text-xs no-underline">
                                ({i.doneBy === "admin" ? "vedoucí" : nameById.get(i.doneBy)} {pragueClock(i.doneAt)})
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {photos.length ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {photos.map((p) => (
                          <a key={p.id} href={`/api/team/attachments/${p.id}`} target="_blank" rel="noopener" title={nameById.get(p.staffId!) ?? ""}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/team/attachments/${p.id}`} alt="Fotka" className="h-16 w-16 rounded-lg object-cover" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {adminFiles.length ? (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {adminFiles.map((f) => (
                          <li key={f.id}>
                            <a
                              href={`/api/team/attachments/${f.id}`}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex max-w-64 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100"
                            >
                              <span>📎</span>
                              <span className="truncate">{f.name}</span>
                              <span className="shrink-0 text-slate-400">{sizeText(f.size)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-4">
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">Upravit</summary>
                        <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
                          {task.templateId ? (
                            <p className="text-xs text-amber-800">
                              Úkol vznikl z úkolu pozice – změny názvu, termínu a voleb dělejte raději v Úkolech pozic (jinak se přepíšou).
                            </p>
                          ) : null}
                          <ActionForm action={updateTask} className="space-y-2" resetOnOk>
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
                              <input name="dueDate" type="date" defaultValue={task.dueDate ?? ""} aria-label="Termín – den" className={input} />
                              <input
                                name="dueTime"
                                type="time"
                                defaultValue={task.dueTime != null ? timeInput(task.dueTime) : ""}
                                aria-label="Termín – čas"
                                className={input}
                              />
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
                            <TaskOptions defaults={task} />
                            <AttachmentInput />
                            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Uložit</button>
                          </ActionForm>
                          {files.length ? (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500">Přílohy a fotky</p>
                              {files.map((f) => (
                                <ActionForm
                                  key={f.id}
                                  action={deleteAttachment}
                                  confirm={`Smazat přílohu „${f.name}“?`}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input type="hidden" name="attachmentId" value={f.id} />
                                  <span className="min-w-0 truncate">
                                    {f.staffId ? `📷 ${nameById.get(f.staffId) ?? "?"} · ` : ""}
                                    {f.name}
                                  </span>
                                  <button className="shrink-0 text-xs text-red-600 hover:underline">smazat</button>
                                </ActionForm>
                              ))}
                            </div>
                          ) : null}
                          <ActionForm action={deleteTask} confirm={`Smazat úkol „${task.title}“?`}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <button className="text-sm text-red-600 hover:underline">Smazat úkol</button>
                          </ActionForm>
                        </div>
                      </details>
                      {log.length ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">Historie ({log.length})</summary>
                          <ol className="mt-1 space-y-0.5 text-xs text-slate-600">
                            {log
                              .slice()
                              .reverse()
                              .map((e) => (
                                <li key={e.id}>
                                  <span className="text-slate-400 tabular-nums">
                                    {dayLabel(pragueToday(new Date(e.createdAt)))} {pragueClock(e.createdAt)}
                                  </span>{" "}
                                  <strong>{e.staffId ? (nameById.get(e.staffId) ?? "?") : "Vedoucí"}</strong> {LOG_LABEL[e.kind] ?? e.kind}
                                  {e.text ? `: ${e.text}` : ""}
                                </li>
                              ))}
                          </ol>
                        </details>
                      ) : null}
                    </div>
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
