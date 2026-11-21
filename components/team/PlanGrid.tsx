"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/app/admin/tym/actions";
import { formatRange, timeInput } from "@/lib/team/domain";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export type PlanShift = {
  id: string;
  staffId: string;
  day: string;
  startMin: number;
  endMin: number;
  roleId: string | null;
  note: string | null;
  overlap: boolean;
};

type Editor = { mode: "add"; staffId: string; day: string } | { mode: "edit"; shift: PlanShift } | null;

/**
 * Ruční plán směn: lidé × dny. „+“ v buňce přidá směnu, klik na směnu ji
 * upraví, smaže nebo zkopíruje na další dny a lidi. Nic se neplánuje samo.
 */
export default function PlanGrid({
  days,
  people,
  shifts,
  roles,
  quickTimes,
  eventId,
  actions,
}: {
  days: { day: string; label: string }[];
  people: { id: string; name: string }[];
  shifts: PlanShift[];
  roles: { id: string; name: string; color: string | null }[];
  quickTimes: { startMin: number; endMin: number }[];
  eventId: string | null;
  actions: { save: Action; remove: Action; copy: Action };
}) {
  const [editor, setEditor] = useState<Editor>(null);
  const [openCount, setOpenCount] = useState(0);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const open = (next: Editor) => {
    setOpenCount((n) => n + 1);
    setEditor(next);
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="sticky left-0 z-10 min-w-36 bg-slate-50 px-2 py-2 text-left font-medium">Člověk</th>
              {days.map((col) => (
                <th key={col.day} className="min-w-32 px-2 py-2 text-left font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="border-t border-slate-100 align-top">
                <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-medium">{person.name}</th>
                {days.map((col) => {
                  const cell = shifts.filter((s) => s.staffId === person.id && s.day === col.day);
                  return (
                    <td key={col.day} className="px-1.5 py-1.5">
                      <div className="flex flex-col gap-1">
                        {cell.map((shift) => {
                          const role = shift.roleId ? roleById.get(shift.roleId) : undefined;
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() => open({ mode: "edit", shift })}
                              title={shift.overlap ? "Překrývá se s jinou směnou téhož člověka" : (shift.note ?? undefined)}
                              className={`rounded-md border px-1.5 py-1 text-left text-xs leading-tight hover:ring-1 hover:ring-slate-400 ${
                                shift.overlap ? "border-red-500" : "border-transparent"
                              }`}
                              style={{ backgroundColor: role?.color ? `${role.color}33` : "#f1f5f9" }}
                            >
                              <span className="font-semibold tabular-nums">
                                {shift.overlap ? "⚠ " : ""}
                                {formatRange(shift.startMin, shift.endMin)}
                              </span>
                              {role ? <span className="block truncate">{role.name}</span> : null}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => open({ mode: "add", staffId: person.id, day: col.day })}
                          aria-label="Přidat směnu"
                          className="rounded-md border border-dashed border-slate-300 py-0.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-700"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor ? (
        <ShiftEditor
          key={openCount}
          editor={editor}
          days={days}
          people={people}
          roles={roles}
          quickTimes={quickTimes}
          eventId={eventId}
          actions={actions}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </>
  );
}

function ShiftEditor({
  editor,
  days,
  people,
  roles,
  quickTimes,
  eventId,
  actions,
  onClose,
}: {
  editor: NonNullable<Editor>;
  days: { day: string; label: string }[];
  people: { id: string; name: string }[];
  roles: { id: string; name: string; color: string | null }[];
  quickTimes: { startMin: number; endMin: number }[];
  eventId: string | null;
  actions: { save: Action; remove: Action; copy: Action };
  onClose: () => void;
}) {
  const shift = editor.mode === "edit" ? editor.shift : null;
  const staffId = shift ? shift.staffId : editor.mode === "add" ? editor.staffId : "";
  const day = shift ? shift.day : editor.mode === "add" ? editor.day : "";
  const first = quickTimes[0];
  const [from, setFrom] = useState(shift ? timeInput(shift.startMin) : first ? timeInput(first.startMin) : "08:00");
  const [to, setTo] = useState(shift ? timeInput(shift.endMin) : first ? timeInput(first.endMin) : "14:00");
  const [saveState, saveAction] = useActionState<FormState, FormData>(actions.save, undefined);
  const [removeState, removeAction] = useActionState<FormState, FormData>(actions.remove, undefined);
  const [copyState, copyAction] = useActionState<FormState, FormData>(actions.copy, undefined);

  // Po uložení nebo smazání se editor zavře; kopírování ho nechá otevřený.
  useEffect(() => {
    if (saveState?.ok || removeState?.ok) onClose();
  }, [saveState, removeState, onClose]);

  const personName = people.find((p) => p.id === staffId)?.name ?? "";
  const dayLabel = days.find((d) => d.day === day)?.label ?? day;
  const input = "mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{shift ? "Upravit směnu" : "Přidat směnu"}</p>
            <p className="text-sm text-slate-500">
              {personName} · {dayLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            Zavřít
          </button>
        </div>

        <form action={saveAction} className="space-y-3">
          {shift ? <input type="hidden" name="shiftId" value={shift.id} /> : null}
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="eventId" value={eventId ?? ""} />
          {quickTimes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {quickTimes.map((q) => (
                <button
                  key={`${q.startMin}-${q.endMin}`}
                  type="button"
                  onClick={() => {
                    setFrom(timeInput(q.startMin));
                    setTo(timeInput(q.endMin));
                  }}
                  className="rounded-full border border-slate-300 px-2.5 py-1 text-xs tabular-nums hover:bg-slate-50"
                >
                  {formatRange(q.startMin, q.endMin)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-slate-500">
              Od
              <input name="from" type="time" step={300} required value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
            </label>
            <label className="flex-1 text-xs text-slate-500">
              Do
              <input name="to" type="time" step={300} required value={to} onChange={(e) => setTo(e.target.value)} className={input} />
            </label>
          </div>
          <label className="block text-xs text-slate-500">
            Pozice
            <select name="roleId" defaultValue={shift?.roleId ?? ""} className={input}>
              <option value="">— bez pozice —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            Poznámka
            <input name="note" defaultValue={shift?.note ?? ""} className={input} />
          </label>
          {saveState?.error ? <p className="text-sm text-red-600">{saveState.error}</p> : null}
          <button className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">Uložit</button>
        </form>

        {shift ? (
          <>
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">Kopírovat na další dny / lidi</summary>
              <form action={copyAction} className="mt-3 space-y-3">
                <input type="hidden" name="shiftId" value={shift.id} />
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Dny</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {days.map((d) => (
                      <label key={d.day} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="copyDay" value={d.day} defaultChecked={d.day === day} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Lidé</p>
                  <div className="flex max-h-40 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
                    {people.map((p) => (
                      <label key={p.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="copyStaff" value={p.id} defaultChecked={p.id === staffId} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                {copyState?.error ? <p className="text-sm text-red-600">{copyState.error}</p> : null}
                {copyState?.ok ? <p className="text-sm text-emerald-700">{copyState.ok}</p> : null}
                <button className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium">Kopírovat</button>
              </form>
            </details>
            <form
              action={removeAction}
              onSubmit={(e) => {
                if (!window.confirm("Opravdu smazat směnu?")) e.preventDefault();
              }}
            >
              <input type="hidden" name="shiftId" value={shift.id} />
              <button className="w-full rounded-lg py-2 text-sm text-red-600 hover:bg-red-50">Smazat směnu</button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
