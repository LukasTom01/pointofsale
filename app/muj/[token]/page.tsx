import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { addDays, canCheckIn, canCheckOut, compareTasks, formatRange, isOverdue, pragueClock, pragueToday } from "@/lib/team/domain";
import { dayLabel, dayLong, dayShort } from "@/lib/team/format";
import { checkIn, checkOut, toggleMyTask } from "./actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

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

  const today = pragueToday();
  const [shifts, tasks, roles, events] = await Promise.all([
    teamStore.listShifts({ from: today, to: addDays(today, 13), staffId: person.id }),
    teamStore.listTasks(),
    teamStore.listRoles(),
    teamStore.listEvents(),
  ]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const todayShifts = shifts.filter((s) => s.day === today);
  const upcoming = shifts.filter((s) => s.day > today);
  const myTasks = tasks.filter((t) => t.assigneeIds.includes(person.id));
  const open = myTasks.filter((t) => t.status !== "done").sort(compareTasks);
  const doneRecently = myTasks.filter((t) => t.status === "done").sort(compareTasks).slice(0, 5);

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-slate-900 px-4 py-4 text-white">
        <p className="text-sm text-white/60">Moje směny a úkoly</p>
        <h1 className="text-2xl font-bold">{person.name}</h1>
      </header>
      <main className="mx-auto max-w-lg space-y-5 p-4">
        <section className="space-y-2">
          <h2 className="font-semibold">Dnes · {dayLong(today)}</h2>
          {todayShifts.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">Dnes nemáte směnu.</p>
          ) : (
            todayShifts.map((s) => (
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
              </div>
            ))
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

        <section className="space-y-2">
          <h2 className="font-semibold">Moje úkoly</h2>
          {open.length === 0 && doneRecently.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">Nemáte žádné úkoly.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
              {[...open, ...doneRecently].map((t) => {
                const isDone = t.status === "done";
                const overdue = isOverdue(t, today);
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <form action={toggleMyTask}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="taskId" value={t.id} />
                      <button
                        aria-label={isDone ? "Vrátit" : "Hotovo"}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 ${
                          isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400"
                        }`}
                      >
                        {isDone ? "✓" : ""}
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className={isDone ? "text-slate-400 line-through" : "font-medium"}>{t.title}</p>
                      {t.dueDate ? (
                        <p className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
                          {overdue ? "Po termínu · " : "Do "}
                          {dayShort(t.dueDate)}
                        </p>
                      ) : null}
                      {t.note && !isDone ? <p className="text-sm whitespace-pre-line text-slate-600">{t.note}</p> : null}
                    </div>
                  </li>
                );
              })}
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
