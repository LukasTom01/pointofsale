"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Category, Product, CardProvider, Order } from "@/lib/types";
import { formatKc } from "@/lib/money";
import Checkout from "@/components/Checkout";

interface Props {
  categories: Category[];
  products: Product[];
  cardProvider: CardProvider;
}

export interface CartLine {
  product: Product;
  qty: number;
}

export default function Pos({ categories, products, cardProvider }: Props) {
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);

  const shown = useMemo(
    () => (activeCat === "all" ? products : products.filter((p) => p.categoryId === activeCat)),
    [products, activeCat],
  );

  const totalHal = useMemo(() => cart.reduce((s, l) => s + l.product.priceHal * l.qty, 0), [cart]);
  const totalQty = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);

  function addToCart(product: Product) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === product.id);
      if (idx === -1) return [...prev, { product, qty: 1 }];
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
  }

  function onPaid(order: Order) {
    setReceipt(order);
    setCheckoutOpen(false);
    setCart([]);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Produkty */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
          <h1 className="text-lg font-bold">Stánkový prodej</h1>
          <Link
            href="/admin"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
          >
            Administrace
          </Link>
        </header>

        {/* Kategorie */}
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
          <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")}>
            Vše
          </CatChip>
          {categories.map((c) => (
            <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} color={c.color}>
              {c.name}
            </CatChip>
          ))}
        </div>

        {/* Mřížka produktů */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="tap-active flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-center shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <span className="text-3xl leading-none">{p.emoji ?? "🛒"}</span>
                <span className="line-clamp-2 text-sm font-semibold text-slate-800">{p.name}</span>
                <span className="text-sm font-bold text-emerald-700">{formatKc(p.priceHal)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Košík */}
      <aside className="flex max-h-[45vh] shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-bold text-slate-800">
            Objednávka {totalQty > 0 && <span className="text-slate-400">({totalQty} ks)</span>}
          </h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-sm font-medium text-red-600 hover:underline">
              Vyprázdnit
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="p-6 text-center text-slate-400">Klikněte na produkt vlevo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cart.map((l) => (
                <li key={l.product.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">
                      {l.product.emoji} {l.product.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatKc(l.product.priceHal)} · {formatKc(l.product.priceHal * l.qty)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <QtyBtn onClick={() => changeQty(l.product.id, -1)}>−</QtyBtn>
                    <span className="w-7 text-center font-bold tabular-nums">{l.qty}</span>
                    <QtyBtn onClick={() => changeQty(l.product.id, +1)}>+</QtyBtn>
                    <button
                      onClick={() => removeLine(l.product.id)}
                      className="ml-1 px-1 text-slate-300 hover:text-red-500"
                      aria-label="Odebrat"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-slate-600">Celkem</span>
            <span className="text-2xl font-extrabold text-slate-900">{formatKc(totalHal)}</span>
          </div>
          <button
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
            className="tap-active w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Zaplatit {cart.length > 0 && `· ${formatKc(totalHal)}`}
          </button>
        </div>
      </aside>

      {checkoutOpen && (
        <Checkout
          cart={cart}
          totalHal={totalHal}
          cardProvider={cardProvider}
          onClose={() => setCheckoutOpen(false)}
          onPaid={onPaid}
        />
      )}

      {receipt && <ReceiptModal order={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function CatChip({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {children}
    </button>
  );
}

function QtyBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap-active flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-700 hover:bg-slate-200"
    >
      {children}
    </button>
  );
}

function ReceiptModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const change =
    order.paymentMethod === "cash" && order.cashGivenHal != null
      ? order.cashGivenHal - order.totalHal
      : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          ✅
        </div>
        <h2 className="text-xl font-bold text-slate-900">Zaplaceno</h2>
        <p className="mt-1 text-slate-500">Účtenka č. {order.number}</p>
        <p className="mt-4 text-3xl font-extrabold">{formatKc(order.totalHal)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {order.paymentMethod === "cash" ? "Hotovost" : "Karta"}
        </p>
        {change != null && change > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 py-3 text-lg font-bold text-amber-700">
            Vrátit: {formatKc(change)}
          </p>
        )}
        <button
          onClick={onClose}
          className="tap-active mt-6 w-full rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white"
        >
          Nová objednávka
        </button>
      </div>
    </div>
  );
}
