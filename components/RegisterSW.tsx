"use client";

import { useEffect } from "react";

// Zaregistruje service worker (PWA). Renderuje se v root layoutu.
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registrace selhala (např. bez HTTPS mimo localhost) – appka funguje i tak.
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
