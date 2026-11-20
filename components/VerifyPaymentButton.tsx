"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ověří u Adyenu platbu objednávky ve stavu "pending" a obnoví přehled.
export default function VerifyPaymentButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/verify`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202 || !res.ok) setMsg(data.error ?? "Ověření se nepodařilo.");
      router.refresh();
    } catch {
      setMsg("Ověření se nepodařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={verify}
        disabled={busy}
        className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Ověřuji…" : "Ověřit platbu"}
      </button>
      {msg && <span className="text-xs text-amber-700">{msg}</span>}
    </span>
  );
}
