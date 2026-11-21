"use client";

import { useState } from "react";

/** Výběr řešitelů: přepínací štítky se jmény; vybraní se odešlou jako pole `assignee`. */
export default function AssigneePicker({
  people,
  defaultSelected = [],
}: {
  people: { id: string; name: string }[];
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
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
            className={`rounded-full border px-2.5 py-1 text-xs ${
              on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"
            }`}
          >
            {on ? "✓ " : ""}
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
