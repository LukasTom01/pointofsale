"use client";

import { useMemo, useState } from "react";
import type { CardProvider, Order } from "@/lib/types";
import { formatKc, kcToHal } from "@/lib/money";
import type { CartLine } from "@/components/Pos";

interface Props {
  cart: CartLine[];
  totalHal: number;
  cardProvider: CardProvider;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

type Step = "method" | "cash" | "card";

export default function Checkout({ cart, totalHal, cardProvider, onClose, onPaid }: Props) {
  const [step, setStep] = useState<Step>("method");
  const [cashGiven, setCashGiven] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashGivenHal = useMemo(() => kcToHal(cashGiven), [cashGiven]);
  const changeHal = cashGivenHal != null ? cashGivenHal - totalHal : null;

  async function submit(payload: {
    paymentMethod: "cash" | "card";
    cashGivenHal?: number | null;
    cardProvider?: CardProvider;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((l) => ({ productId: l.product.id, quantity: l.qty })),
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Nepodařilo se uložit objednávku.");
      onPaid(data as Order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Neznámá chyba.");
    } finally {
      setBusy(false);
    }
  }

  // Rychlé částky hotovosti (nejbližší kulaté nad total).
  const quickCash = useMemo(() => {
    const kc = totalHal / 100;
    const roundUps = [
      Math.ceil(kc / 10) * 10,
      Math.ceil(kc / 50) * 50,
      Math.ceil(kc / 100) * 100,
      Math.ceil(kc / 200) * 200,
      Math.ceil(kc / 500) * 500,
    ];
    return Array.from(new Set([kc, ...roundUps])).slice(0, 5);
  }, [totalHal]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm text-slate-500">K úhradě</p>
            <p className="text-2xl font-extrabold text-slate-900">{formatKc(totalHal)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-2xl text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>
          )}

          {step === "method" && (
            <div className="grid gap-3">
              <button
                onClick={() => setStep("cash")}
                className="tap-active flex items-center gap-4 rounded-2xl border-2 border-slate-200 p-5 text-left hover:border-emerald-400"
              >
                <span className="text-4xl">💵</span>
                <span>
                  <span className="block text-lg font-bold text-slate-900">Hotovost</span>
                  <span className="text-sm text-slate-500">Výpočet vrácení</span>
                </span>
              </button>
              <button
                onClick={() => setStep("card")}
                className="tap-active flex items-center gap-4 rounded-2xl border-2 border-slate-200 p-5 text-left hover:border-emerald-400"
              >
                <span className="text-4xl">💳</span>
                <span>
                  <span className="block text-lg font-bold text-slate-900">Karta</span>
                  <span className="text-sm text-slate-500">
                    {cardProvider === "adyen"
                      ? "Odeslání do terminálu"
                      : "Potvrzení platby na terminálu"}
                  </span>
                </span>
              </button>
            </div>
          )}

          {step === "cash" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Přijato</label>
              <input
                type="text"
                inputMode="decimal"
                value={cashGiven}
                onChange={(e) => setCashGiven(e.target.value)}
                placeholder={(totalHal / 100).toFixed(2)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-2xl font-bold tabular-nums outline-none focus:border-emerald-500"
              />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {quickCash.map((kc) => (
                  <button
                    key={kc}
                    onClick={() => setCashGiven(kc.toFixed(2))}
                    className="tap-active rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    {kc.toLocaleString("cs-CZ")} Kč
                  </button>
                ))}
              </div>

              {changeHal != null && (
                <div
                  className={`mt-4 rounded-xl p-4 text-center ${
                    changeHal < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {changeHal < 0 ? (
                    <>Chybí {formatKc(-changeHal)}</>
                  ) : (
                    <>
                      <span className="text-sm">Vrátit</span>
                      <div className="text-3xl font-extrabold">{formatKc(changeHal)}</div>
                    </>
                  )}
                </div>
              )}

              <button
                disabled={busy || (cashGivenHal != null && cashGivenHal < totalHal)}
                onClick={() =>
                  submit({
                    paymentMethod: "cash",
                    cashGivenHal: cashGivenHal != null && cashGivenHal >= totalHal ? cashGivenHal : null,
                  })
                }
                className="tap-active mt-5 w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white disabled:bg-slate-300"
              >
                {busy ? "Ukládám…" : "Zaevidovat prodej"}
              </button>
            </div>
          )}

          {step === "card" && (
            <CardStep
              provider={cardProvider}
              totalHal={totalHal}
              busy={busy}
              onConfirm={() => submit({ paymentMethod: "card", cardProvider })}
            />
          )}
        </div>

        {step !== "method" && (
          <div className="border-t border-slate-200 p-4">
            <button
              onClick={() => {
                setStep("method");
                setError(null);
              }}
              className="w-full rounded-xl py-2 font-medium text-slate-500 hover:text-slate-800"
            >
              ← Zpět na výběr platby
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardStep({
  provider,
  totalHal,
  busy,
  onConfirm,
}: {
  provider: CardProvider;
  totalHal: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  if (provider === "adyen") {
    return (
      <div className="text-center">
        <p className="mb-4 text-slate-600">
          Částka <strong>{formatKc(totalHal)}</strong> se odešle do terminálu. Nechte zákazníka zaplatit kartou na
          terminálu a vyčkejte na dokončení.
        </p>
        <button
          disabled={busy}
          onClick={onConfirm}
          className="tap-active w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white disabled:bg-slate-300"
        >
          {busy ? "Čekám na terminál…" : "Odeslat do terminálu"}
        </button>
        <p className="mt-3 text-xs text-slate-400">Platba se dokončí na terminálu.</p>
      </div>
    );
  }

  // Ruční potvrzení (výchozí – funguje se stávajícím DISH PAY NOW).
  return (
    <div className="text-center">
      <div className="mb-4 rounded-2xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">Naťukejte na terminálu částku</p>
        <p className="my-1 text-4xl font-extrabold text-slate-900">{formatKc(totalHal)}</p>
        <p className="text-sm text-slate-500">a nechte zákazníka zaplatit kartou.</p>
      </div>
      <button
        disabled={busy}
        onClick={onConfirm}
        className="tap-active w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white disabled:bg-slate-300"
      >
        {busy ? "Ukládám…" : "Platba proběhla – zaevidovat"}
      </button>
      <p className="mt-3 text-xs text-slate-400">
        Potvrďte až po úspěšné platbě na terminálu.
      </p>
    </div>
  );
}
