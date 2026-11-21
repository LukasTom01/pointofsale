import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import {
  addDays,
  canCheckIn,
  canCheckOut,
  compareTasks,
  formatRange,
  isDoneFor,
  isOverdue,
  pragueClock,
  pragueNow,
  progressText,
  type Now,
} from "@/lib/team/domain";
import { dayLabel, dayLong, dueText } from "@/lib/team/format";
import { sizeText } from "@/lib/team/attachments";
import { pushConfigured, vapidPublicKey } from "@/lib/team/push";
import { tickSoon } from "@/lib/team/notify";
import type { Task, TaskAttachment } from "@/lib/team/types";
import PushToggle from "@/components/team/PushToggle";
import PhotoDoneButton from "@/components/team/PhotoDoneButton";
import {
  checkIn,
  checkOut,
  completeWithPhoto,
  removePush,
  reportProblem,
  savePush,
  toggleMyChecklistItem,
  toggleMyTask,
} from "./actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const PROBLEMS = ["Chybí materiál", "Nestihnu to", "Nevím, jak na to", "Nejde to udělat"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Moje směny",
    manifest: `/muj/${encodeURIComponent(token)}/manifest.webmanifest`,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    appleWebApp: { capable: true, title: "Směny", statusBarStyle: "black-translucent" },
  };
}

export default async function MyPage({ params }: Props) {
  const { token } = await params;
  const profile = token.length >= 16 ? await teamStore.profileByToken(token) : null;
  const person = profile ? await getStaff(profile.staffId) : null;
  if (!profile || !person) notFound();
  tickSoon();

  const now = pragueNow();
  const today = now.day;
  const [shifts, tasks, roles, events, attachments] = await Promise.all([
    teamStore.listShifts({ from: today, to: addDays(today, 13), staffId: person.id }),
    teamStore.listTasks(),
    teamStore.listRoles(),
    teamStore.listEvents(),
    teamStore.listAttachments(),
  ]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const todayShifts = shifts.filter((s) => s.day === today);
  const upcoming = shifts.filter((s) => s.day > today);
  const myTasks = tasks.filter((t) => t.assigneeIds.includes(person.id));
  const inShift = new Set(todayShifts.map((s) => s.id));
  const loose = myTasks.filter((t) => !(t.shiftId && inShift.has(t.shiftId)));
  const open = loose.filter((t) => !isDoneFor(t, person.id)).sort(compareTasks);
  const doneRecently = loose
    .filter((t) => isDoneFor(t, person.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const publicKey = pushConfigured() ? vapidPublicKey() : null;
  const ctx: ItemCtx = { token, staffId: person.id, now, attachments };

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-slate-900 px-4 py-4 text-white">
        <p className="text-sm text-white/60">Moje směny a úkoly</p>
        <h1 className="text-2xl font-bold">{person.name}</h1>
      </header>
      <main className="mx-auto max-w-lg space-y-5 p-4">
        {publicKey ? (
          <PushToggle publicKey={publicKey} onSave={savePush.bind(null, token)} onRemove={removePush.bind(null, token)} />
        ) : null}

        <section className="space-y-2">
          <h2 className="font-semibold">Dnes · {dayLong(today)}</h2>
          {todayShifts.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">Dnes nemáte směnu.</p>
          ) : (
            todayShifts.map((s) => {
              const shiftTasks = myTasks.filter((t) => t.shiftId === s.id).sort(compareTasks);
              return (
                <div key={s.id} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{formatRange(s.startMin, s.endMin)}</p>
                    <p className="text-sm text-slate-600">
                      {[s.roleId ? roleName.get(s.roleId) : null, s.eventId ? eventName.get(s.eventId) : null].filter(Boolean).join(" · ")}
                    </p>
                    {s.note ? <p className="text-sm text-slate-500">{s.note}</p> : null}
                  </div>
                  {s.attendance === "absent" ? (
                    <p className="text-sm text-red-600">Vedoucí vás u této směny označil/a jako nepřítomné. Ozvěte se mu/jí.</p>
                  ) : canCheckIn(s, today) ? (
                    <form action={checkIn}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="shiftId" value={s.id} />
                      <button className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white active:bg-emerald-700">
                        Jsem tady
                      </button>
                    </form>
                  ) : canCheckOut(s) ? (
                    <>
                      <p className="text-sm text-emerald-700">Příchod zapsán v {pragueClock(s.checkInAt)}.</p>
                      <form action={checkOut}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="shiftId" value={s.id} />
                        <button className="w-full rounded-xl bg-slate-900 py-4 text-lg font-bold text-white active:bg-slate-700">
                          Odcházím
                        </button>
                      </form>
                    </>
                  ) : (
                    <p className="text-sm text-emerald-700">
                      Hotovo: {pragueClock(s.checkInAt)} – {pragueClock(s.checkOutAt)}. Díky!
                    </p>
                  )}
                  {shiftTasks.length ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Úkoly na této směně</p>
                      <ul className="-mx-4 divide-y divide-slate-100 border-t border-slate-100">
                        {shiftTasks.map((t) => (
                          <TaskItem key={t.id} task={t} ctx={ctx} />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">
            Moje úkoly{open.length ? <span className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{open.length}</span> : null}
          </h2>
          {open.length === 0 && doneRecently.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">Nemáte žádné úkoly.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
              {open.map((t) => (
                <TaskItem key={t.id} task={t} ctx={ctx} />
              ))}
              {doneRecently.map((t) => (
                <TaskItem key={t.id} task={t} ctx={ctx} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Další směny</h2>
          {upcoming.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">Na další dva týdny nemáte naplánovanou směnu.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="font-medium">{dayLabel(s.day)}</span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums">{formatRange(s.startMin, s.endMin)}</span>
                    {s.roleId && roleName.get(s.roleId) ? (
                      <span className="block text-xs text-slate-500">{roleName.get(s.roleId)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="pb-6 text-center text-xs text-slate-400">
          Tip: v prohlížeči zvolte „Přidat na plochu“ – stránka se pak otevře jako aplikace. Odkaz nikomu nepřeposílejte.
        </p>
      </main>
    </div>
  );
}

type ItemCtx = { token: string; staffId: string; now: Now; attachments: TaskAttachment[] };

const Hidden = ({ token, taskId }: { token: string; taskId: string }) => (
  <>
    <input type="hidden" name="token" value={token} />
    <input type="hidden" name="taskId" value={taskId} />
  </>
);

/** Jeden úkol: odškrtnutí jedním ťuknutím, checklist, fotka, „Mám problém“. */
function TaskItem({ task: t, ctx }: { task: Task; ctx: ItemCtx }) {
  const { token, staffId, now } = ctx;
  const mineDone = isDoneFor(t, staffId);
  const closed = t.status === "done";
  const needsPhoto = t.requiresPhoto && !mineDone;
  const overdue = !mineDone && isOverdue(t, now);
  const files = ctx.attachments.filter((a) => a.taskId === t.id && (a.staffId == null || a.staffId === staffId));
  const progress = progressText(t);
  const checked = t.checklist.filter((i) => i.doneAt).length;
  const canEdit = t.status !== "done" && t.status !== "review";

  return (
    <li id={`ukol-${t.id}`} className="scroll-mt-4 px-4 py-3 target:bg-amber-50">
      <div className="flex items-start gap-3">
        {needsPhoto ? (
          <PhotoDoneButton token={token} taskId={t.id} action={completeWithPhoto} label="📷" compact />
        ) : (
          <form action={toggleMyTask}>
            <Hidden token={token} taskId={t.id} />
            <button
              aria-label={mineDone ? "Vrátit" : "Hotovo"}
              disabled={closed && t.requiresReview}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 text-lg ${
                mineDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 active:bg-slate-100"
              }`}
            >
              {mineDone ? "✓" : ""}
            </button>
          </form>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className={mineDone ? "text-slate-400 line-through" : "font-medium"}>{t.title}</p>
          <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
            {t.dueDate ? (
              <span className={overdue ? "font-semibold text-red-600" : ""}>
                {overdue ? "Po termínu · " : "Termín: "}
                {dueText(t.dueDate, t.dueTime, now.day)}
              </span>
            ) : null}
            {t.checklist.length ? <span>☑ {checked}/{t.checklist.length}</span> : null}
            {progress ? <span>hotovo {progress}</span> : null}
          </p>

          {t.status === "review" ? (
            <p className="rounded-lg bg-sky-50 px-2 py-1 text-sm text-sky-800">⏳ Čeká na kontrolu vedoucím</p>
          ) : null}
          {mineDone && t.status === "doing" ? (
            <p className="text-xs text-slate-500">Vaše část je hotová, čeká se na ostatní.</p>
          ) : null}
          {t.adminNote && !closed ? (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900">💬 Vedoucí: {t.adminNote}</p>
          ) : null}

          {!mineDone && t.note ? <p className="text-sm whitespace-pre-line text-slate-600">{t.note}</p> : null}

          {!mineDone && t.checklist.length ? (
            <ul className="space-y-1">
              {t.checklist.map((i) => (
                <li key={i.id}>
                  <form action={toggleMyChecklistItem}>
                    <Hidden token={token} taskId={t.id} />
                    <input type="hidden" name="itemId" value={i.id} />
                    <button
                      disabled={!canEdit}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-left text-sm active:bg-slate-50"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                          i.doneAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400"
                        }`}
                      >
                        {i.doneAt ? "✓" : ""}
                      </span>
                      <span className={i.doneAt ? "text-slate-400 line-through" : ""}>{i.text}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          {files.length && !mineDone ? (
            <ul className="space-y-1">
              {files.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/muj/${encodeURIComponent(token)}/priloha/${f.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm"
                  >
                    <span>{f.staffId ? "📷" : "📎"}</span>
                    <span className="truncate">{f.staffId ? "Moje fotka" : f.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{sizeText(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {needsPhoto ? <PhotoDoneButton token={token} taskId={t.id} action={completeWithPhoto} /> : null}

          {!mineDone && t.problem ? (
            <p className="rounded-lg bg-red-50 px-2 py-1 text-sm text-red-800">
              ⚠️ Nahlášeno: {t.problem.reason}. Vedoucí o tom ví.
            </p>
          ) : null}
          {!mineDone && !t.problem && canEdit ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-slate-500 underline">Mám problém</summary>
              <form action={reportProblem} className="mt-2 space-y-2">
                <Hidden token={token} taskId={t.id} />
                <div className="flex flex-wrap gap-2">
                  {PROBLEMS.map((r) => (
                    <button
                      key={r}
                      name="reason"
                      value={r}
                      className="rounded-full border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 active:bg-red-100"
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input name="text" maxLength={300} placeholder="Nebo napište…" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
                  <button name="reason" value="Jiný problém" className="h-10 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white">
                    Odeslat
                  </button>
                </div>
              </form>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}
