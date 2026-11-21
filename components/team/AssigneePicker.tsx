"use client";

import { useState } from "react";

/** Výběr řešitelů (lze více lidí): přepínací štítky se jmény; vybraní se odešlou jako pole `assignee`. */
export default function AssigneePicker({
  people,
  defaultSelected = [],
}: {
  people: { id: string; name: string }[];
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allOn = people.length > 0 && people.every((p) => selected.includes(p.id));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        <span>
          Kdo to udělá – klikněte na jednoho nebo více lidí
          {selected.length > 0 ? <strong className="text-slate-800"> · vybráno {selected.length}</strong> : null}
        </span>
        {people.length > 1 ? (
          <button
            type="button"
            onClick={() => setSelected(allOn ? [] : people.map((p) => p.id))}
            className="text-slate-600 underline hover:text-slate-900"
          >
            {allOn ? "Zrušit výběr" : "Vybrat všechny"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => (
          <input key={id} type="hidden" name="assignee" value={id} />
        ))}
        {people.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"
              }`}
            >
              {on ? "✓ " : ""}
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
