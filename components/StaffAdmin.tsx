"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffMember } from "@/lib/types";

// Správa lidí, kterým lze v pokladně zapsat objednávku „na účet“.
export default function StaffAdmin({ initialStaff }: { initialStaff: StaffMember[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function call(url: string, init: RequestInit) {
    setError(null);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Akce se nepodařila.");
    router.refresh(); // obnoví i sekci kontaktů a odkazů pod seznamem
    return data;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const m = (await call("/api/staff", { method: "POST", body: JSON.stringify({ name }) })) as StaffMember;
      setStaff((s) => [...s, m]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(m: StaffMember, change: Partial<StaffMember>) {
    try {
      const u = (await call(`/api/staff/${m.id}`, { method: "PATCH", body: JSON.stringify(change) })) as StaffMember;
      setStaff((s) => s.map((x) => (x.id === u.id ? u : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba.");
    }
  }

  async function rename(m: StaffMember) {
    const n = window.prompt("Nové jméno", m.name)?.trim();
    if (n && n !== m.name) await patch(m, { name: n });
  }

  async function remove(m: StaffMember) {
    if (!window.confirm(`Smazat ${m.name}? Historie objednávek na účet zůstane zachovaná.`)) return;
    try {
      await call(`/api/staff/${m.id}`, { method: "DELETE" });
      setStaff((s) => s.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba.");
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Lidé na účet</h1>
        <p className="text-sm text-slate-500">
          Zaměstnanci a brigádníci, kteří si berou jídlo a pití zdarma. V pokladně je vyberete u platby{" "}
          <strong>„Na účet“</strong>; objednávka se zaeviduje, ale nepočítá se do tržby.
        </p>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jméno, např. Petr N."
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
        />
        <button
          disabled={busy || !name.trim()}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white disabled:bg-slate-300"
        >
          Přidat
        </button>
      </form>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white">
        {staff.length === 0 ? (
          <p className="p-6 text-center text-slate-400">Zatím nikdo. Přidejte první osobu výše.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {staff.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">👤</span>
                <span className={`min-w-0 flex-1 truncate font-medium ${m.active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                  {m.name}
                </span>
                <button
                  onClick={() => patch(m, { active: !m.active })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    m.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                  title="Neaktivní osoba se v pokladně nenabízí"
                >
                  {m.active ? "Aktivní" : "Skrytý"}
                </button>
                <button onClick={() => rename(m)} className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
                  Přejmenovat
                </button>
                <button onClick={() => remove(m)} className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50">
                  Smazat
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
