"use client";

import { useState } from "react";

/** Zkopíruje osobní odkaz (celou adresu) do schránky. */
export default function CopyLinkButton({ path }: { path: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50"
    >
      {done ? "Zkopírováno ✓" : "Kopírovat odkaz"}
    </button>
  );
}
