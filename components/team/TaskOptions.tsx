import { checklistText } from "@/lib/team/domain";
import type { ChecklistItem } from "@/lib/team/types";

export const REMIND_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Nepřipomínat" },
  { value: "0", label: "V čas termínu" },
  { value: "15", label: "15 min předem" },
  { value: "30", label: "30 min předem" },
  { value: "60", label: "1 h předem" },
  { value: "120", label: "2 h předem" },
  { value: "240", label: "4 h předem" },
];

const field = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

/** Volby úkolu: připomínka, způsob splnění, fotka, kontrola, checklist. */
export default function TaskOptions({
  defaults,
  showCompletion = true,
}: {
  defaults?: {
    remindMin: number | null;
    completion?: "each" | "any";
    requiresPhoto: boolean;
    requiresReview: boolean;
    checklist: ChecklistItem[] | string[];
  };
  showCompletion?: boolean;
}) {
  const remind = defaults ? (defaults.remindMin == null ? "" : String(defaults.remindMin)) : "60";
  const list = defaults?.checklist ?? [];
  const listText = list.length && typeof list[0] === "string" ? (list as string[]).join("\n") : checklistText(list as ChecklistItem[]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-slate-600">🔔</span>
          <select name="remindMin" defaultValue={REMIND_OPTIONS.some((o) => o.value === remind) ? remind : "60"} className={field} aria-label="Připomínka">
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {showCompletion ? (
          <select name="completion" defaultValue={defaults?.completion ?? "each"} className={field} aria-label="Kdo musí odškrtnout">
            <option value="each">Více lidí: každý zvlášť</option>
            <option value="any">Více lidí: stačí jeden</option>
          </select>
        ) : null}
        <label className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2">
          <input type="checkbox" name="requiresPhoto" value="1" defaultChecked={defaults?.requiresPhoto} /> 📷 Splnit s fotkou
        </label>
        <label className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2">
          <input type="checkbox" name="requiresReview" value="1" defaultChecked={defaults?.requiresReview} /> 👀 Zkontroluji já
        </label>
      </div>
      <textarea
        name="checklist"
        rows={Math.max(2, Math.min(8, list.length + 1))}
        maxLength={8000}
        defaultValue={listText}
        placeholder="Checklist (nepovinné) – co řádek, to bod"
        className="w-full rounded-lg border border-slate-300 p-2 text-sm"
      />
    </div>
  );
}
