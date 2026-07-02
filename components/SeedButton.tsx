"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tlačítko „Načíst ukázkové produkty" – zavolá /api/seed a obnoví stránku.
export default function SeedButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Nepodařilo se načíst ukázková data.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Neznámá chyba.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className={className ?? "rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:bg-slate-300"}
      >
        {busy ? "Načítám…" : "Načíst ukázkové produkty"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
