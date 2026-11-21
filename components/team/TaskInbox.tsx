import Link from "next/link";
import { pragueClock } from "@/lib/team/domain";
import type { Task, TaskAttachment } from "@/lib/team/types";
import ActionForm from "./ActionForm";
import { approveTask, resolveProblem, returnTask } from "@/app/admin/tym/actions";

/** Co čeká na vedoucího: nahlášené problémy a úkoly ke kontrole – rovnou s tlačítky. */
export default function TaskInbox({
  tasks,
  nameById,
  attachments,
}: {
  tasks: Task[];
  nameById: Map<string, string>;
  attachments: TaskAttachment[];
}) {
  const problems = tasks.filter((t) => t.problem);
  const review = tasks.filter((t) => t.status === "review");
  if (problems.length === 0 && review.length === 0) return null;
  const photos = (taskId: string) => attachments.filter((a) => a.taskId === taskId && a.staffId);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {problems.length ? (
        <section className="rounded-xl border-l-4 border-red-600 bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            ⚠️ Nahlášené problémy <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{problems.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {problems.map((t) => (
              <li key={t.id} className="space-y-1 py-2">
                <Link href={`#ukol-${t.id}`} className="block text-sm font-medium hover:underline">
                  {t.title}
                </Link>
                <p className="text-sm text-red-700">
                  {nameById.get(t.problem!.staffId) ?? "?"}: {t.problem!.reason}{" "}
                  <span className="text-xs text-slate-400">{pragueClock(t.problem!.at)}</span>
                </p>
                <ActionForm action={resolveProblem} className="flex flex-wrap gap-2">
                  <input type="hidden" name="taskId" value={t.id} />
                  <input name="adminNote" maxLength={500} placeholder="Odpověď (nepovinné, přijde mu/jí)" className="h-9 min-w-40 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
                  <button className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Vyřešeno</button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {review.length ? (
        <section className="rounded-xl border-l-4 border-sky-600 bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            👀 Ke kontrole <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white">{review.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {review.map((t) => (
              <li key={t.id} className="space-y-1 py-2">
                <Link href={`#ukol-${t.id}`} className="block text-sm font-medium hover:underline">
                  {t.title}
                </Link>
                <p className="text-xs text-slate-500">{t.doneBy.map((id) => nameById.get(id)).filter(Boolean).join(", ")}</p>
                {photos(t.id).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {photos(t.id).map((p) => (
                      <a key={p.id} href={`/api/team/attachments/${p.id}`} target="_blank" rel="noopener">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/team/attachments/${p.id}`} alt="Fotka" className="h-20 w-20 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start gap-2">
                  <form action={approveTask}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <button className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">✓ Schválit</button>
                  </form>
                  <ActionForm action={returnTask} className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <input type="hidden" name="taskId" value={t.id} />
                    <input name="adminNote" maxLength={500} placeholder="Co opravit?" className="h-9 min-w-32 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
                    <button className="h-9 rounded-lg border border-slate-300 px-3 text-sm">Vrátit</button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
