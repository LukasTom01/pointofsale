"use client";

import { useEffect, useState } from "react";

type Sub = { endpoint: string; p256dh: string; auth: string };
type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toSub(s: PushSubscription): Sub | null {
  const j = s.toJSON();
  return j.endpoint && j.keys?.p256dh && j.keys?.auth ? { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth } : null;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Zapnutí push notifikací na tomto zařízení. Na iPhonu fungují jen z ikony na ploše,
 * proto tam nejdřív ukáže návod „Přidat na plochu“.
 */
export default function PushToggle({
  publicKey,
  onSave,
  onRemove,
  variant = "worker",
}: {
  publicKey: string;
  onSave: (sub: Sub) => Promise<unknown>;
  onRemove: (endpoint: string) => Promise<unknown>;
  variant?: "worker" | "admin";
}) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (isIos() && !isStandalone()) return setState("ios-install");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ? toSub(existing) : null;
      if (sub && Notification.permission === "granted") {
        await onSave(sub).catch(() => undefined); // pro jistotu znovu uložit na server
        setState("on");
      } else setState("off");
    })().catch(() => setState("unsupported"));
  }, [onSave]);

  async function enable() {
    setError(null);
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const s =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const sub = toSub(s);
      if (!sub) throw new Error("no keys");
      await onSave(sub);
      setState("on");
    } catch {
      setError("Nepodařilo se zapnout. Zkuste to znovu.");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.getSubscription();
    if (s) {
      await onRemove(s.endpoint).catch(() => undefined);
      await s.unsubscribe().catch(() => undefined);
    }
    setState("off");
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "on") {
    return (
      <p className="flex items-center justify-between gap-2 text-sm text-emerald-700">
        <span>🔔 Upozornění jsou zapnutá{variant === "admin" ? " na tomto zařízení" : ""}.</span>
        <button onClick={disable} className="text-xs text-slate-500 underline">
          vypnout
        </button>
      </p>
    );
  }

  const box = variant === "worker" ? "rounded-xl border-2 border-amber-400 bg-amber-50 p-4" : "rounded-lg bg-amber-50 p-3";

  if (state === "ios-install") {
    return (
      <div className={`${box} space-y-1 text-sm`}>
        <p className="font-semibold">🔔 Aby vám chodila upozornění na úkoly:</p>
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>
            Ťukněte dole na <strong>Sdílet</strong> (čtvereček se šipkou).
          </li>
          <li>
            Zvolte <strong>Přidat na plochu</strong>.
          </li>
          <li>Otevřete appku z ikony na ploše a zapněte upozornění.</li>
        </ol>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className={`${box} text-sm`}>
        🔕 Upozornění jsou v prohlížeči zakázaná. Povolte je v nastavení telefonu (Oznámení → tato appka / prohlížeč).
      </p>
    );
  }

  return (
    <div className={box}>
      <button
        onClick={enable}
        disabled={state === "busy"}
        className={
          variant === "worker"
            ? "w-full rounded-xl bg-amber-500 py-3 text-lg font-bold text-white active:bg-amber-600 disabled:opacity-60"
            : "rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        }
      >
        {state === "busy" ? "Zapínám…" : variant === "worker" ? "🔔 Zapnout upozornění na úkoly" : "🔔 Zapnout upozornění na tomto zařízení"}
      </button>
      {variant === "admin" ? (
        <p className="mt-1 text-xs text-slate-600">Přijde vám, když někdo nahlásí problém, pošle úkol ke kontrole nebo je úkol po termínu.</p>
      ) : null}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
