"use client";

import { useEffect, useState } from "react";

// Přepne stránku do celé obrazovky (skryje adresní řádek i lištu prohlížeče).
// Hodí se tam, kde nejde appku nainstalovat (např. terminál DISH PAY NOW).
// Prohlížeče vyžadují klepnutí uživatele – po obnovení stránky je třeba
// klepnout znovu.
export default function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(Boolean(document.documentElement.requestFullscreen) && document.fullscreenEnabled !== false);
    const sync = () => setActive(document.fullscreenElement != null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (!supported) return null;

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Prohlížeč celou obrazovku odmítl – nic se neděje.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={active ? "Ukončit celou obrazovku" : "Celá obrazovka"}
      title={active ? "Ukončit celou obrazovku" : "Celá obrazovka"}
      className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {active ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
      <span className="hidden min-[400px]:inline">{active ? "Zmenšit" : "Celá obrazovka"}</span>
    </button>
  );
}
