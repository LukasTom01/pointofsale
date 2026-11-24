// Úkoly pozic → konkrétní úkoly pro směny. Kdo má směnu s pozicí, dostane její úkoly
// s termínem podle začátku/konce směny. Řeší se jen dnešní a budoucí směny;
// historie (minulé dny) zůstává beze změny.
import { teamStore } from "./store";
import { addDays, checklistText, parseChecklist, pragueToday, roleTaskDueMin } from "./domain";
import type { NewTask, RoleTask, Shift, Task } from "./types";

const HORIZON_DAYS = 60;

function planned(t: RoleTask, shift: Shift): NewTask {
  return {
    title: t.title,
    note: t.note,
    dueDate: shift.day,
    dueTime: roleTaskDueMin(t, shift),
    eventId: shift.eventId,
    assigneeIds: [shift.staffId],
    completion: "each",
    requiresPhoto: t.requiresPhoto,
    requiresReview: t.requiresReview,
    remindMin: t.remindMin,
    shiftId: shift.id,
    templateId: t.id,
  };
}

const untouched = (task: Task) => task.status === "todo" && task.doneBy.length === 0 && !task.problem;

/** Srovná vygenerované úkoly se směnami a úkoly pozic. Vrací počet změn. */
export async function syncRoleTasks(): Promise<number> {
  const today = pragueToday();
  const [templates, shifts, tasks] = await Promise.all([
    teamStore.listRoleTasks(),
    teamStore.listShifts({ from: today, to: addDays(today, HORIZON_DAYS) }),
    teamStore.listTasks(),
  ]);
  const generated = tasks.filter((t) => t.templateId && t.shiftId);
  if (templates.length === 0 && generated.length === 0) return 0;

  const byKey = new Map(generated.map((t) => [`${t.templateId}|${t.shiftId}`, t]));
  const wanted = new Set<string>();
  let changes = 0;

  for (const shift of shifts) {
    if (!shift.roleId) continue;
    for (const tpl of templates.filter((t) => t.roleId === shift.roleId)) {
      const key = `${tpl.id}|${shift.id}`;
      wanted.add(key);
      const want = planned(tpl, shift);
      const have = byKey.get(key);
      if (!have) {
        await teamStore.createTask({ ...want, checklist: parseChecklist(tpl.checklist.join("\n")) });
        changes++;
        continue;
      }
      if (have.status === "done" || have.status === "review") continue;
      const drift =
        have.title !== want.title ||
        have.note !== want.note ||
        have.dueDate !== want.dueDate ||
        have.dueTime !== want.dueTime ||
        have.eventId !== want.eventId ||
        have.assigneeIds.join() !== want.assigneeIds.join() ||
        have.requiresPhoto !== want.requiresPhoto ||
        have.requiresReview !== want.requiresReview ||
        have.remindMin !== want.remindMin ||
        checklistText(have.checklist) !== tpl.checklist.join("\n");
      if (drift) {
        await teamStore.updateTask({
          ...have,
          ...want,
          doneBy: have.doneBy.filter((id) => want.assigneeIds.includes(id)),
          checklist: parseChecklist(tpl.checklist.join("\n"), have.checklist),
        });
        changes++;
      }
    }
  }

  // Směna zrušená / změněná pozice / smazaný úkol pozice → nedotčené budoucí úkoly pryč.
  for (const task of generated) {
    const key = `${task.templateId}|${task.shiftId}`;
    if (wanted.has(key) || !task.dueDate || task.dueDate < today || task.dueDate > addDays(today, HORIZON_DAYS)) continue;
    if (!untouched(task)) continue;
    await teamStore.deleteTask(task.id);
    changes++;
  }
  return changes;
}
