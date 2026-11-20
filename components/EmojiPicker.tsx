"use client";

import { useState } from "react";

// Kurátorovaný výběr emoji pro dlaždice produktů (stánek s občerstvením).
const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Nápoje",
    emojis: ["🥤", "🍺", "🍻", "🍷", "🥂", "🍹", "🧃", "☕", "🍵", "🧋", "💧", "🥛", "🧊", "🍸"],
  },
  {
    label: "Jídlo",
    emojis: ["🌭", "🍟", "🍔", "🍕", "🥪", "🥯", "🥨", "🌮", "🌯", "🥙", "🧆", "🍗", "🍖", "🥔", "🌽", "🍜", "🍲", "🥘", "🍳", "🧀"],
  },
  {
    label: "Sladké",
    emojis: ["🍩", "🍦", "🍨", "🍧", "🧁", "🍰", "🎂", "🍪", "🍫", "🍬", "🍭", "🥧", "🍮", "🥐", "🥞", "🍯"],
  },
  {
    label: "Ovoce",
    emojis: ["🍎", "🍏", "🍓", "🍒", "🍑", "🍉", "🍊", "🍋", "🍌", "🍇", "🥝", "🍍", "🥥", "🫐"],
  },
  {
    label: "Ostatní",
    emojis: ["🛒", "🏷️", "⭐", "🔥", "❄️", "🎈", "🎉", "💰", "🎁", "🌶️", "🧂", "🍽️"],
  },
];

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

export default function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  function pick(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Vybrat ikonu"
        className="flex h-full min-h-10 w-16 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl hover:border-emerald-500"
      >
        {value || <span className="text-base text-slate-300">🙂</span>}
      </button>

      {open && (
        <>
          {/* kliknutí mimo zavře */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => pick("")}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
              >
                Bez ikony
              </button>
            </div>
            {GROUPS.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="mb-1 px-1 text-xs font-semibold text-slate-400">{g.label}</p>
                <div className="grid grid-cols-7 gap-1">
                  {g.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => pick(e)}
                      className={`flex h-9 items-center justify-center rounded-lg text-xl hover:bg-slate-100 ${
                        value === e ? "bg-emerald-100 ring-1 ring-emerald-400" : ""
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
