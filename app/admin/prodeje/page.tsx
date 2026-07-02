import Link from "next/link";
import { listOrders } from "@/lib/store";
import { formatKc } from "@/lib/money";
import { resolveRange, presets } from "@/lib/dateRange";
import { productSummary, totals } from "@/lib/reports";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProdejePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; day?: string }>;
}) {
  const sp = await searchParams;
  // Zpětná kompatibilita: starý odkaz s ?day= funguje dál.
  const { fromStr, toStr, from, to } = resolveRange(sp.from ?? sp.day, sp.to ?? sp.day);
  const orders = await listOrders({ from, to });

  const t = totals(orders);
  const products = productSummary(orders);
  const exportQs = `from=${fromStr}&to=${toStr}`;
  const presetList = presets();
  const activePreset = presetList.find((p) => p.from === fromStr && p.to === toStr)?.key;

  return (
    <div className="grid gap-4">
      {/* Rychlé rozsahy – jedním kliknutím nastaví přehled i export */}
      <div className="flex flex-wrap gap-2">
        {presetList.map((p) => (
          <Link
            key={p.key}
            href={`/admin/prodeje?from=${p.from}&to=${p.to}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activePreset === p.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-sm font-medium text-slate-600">
          Od
          <input type="date" name="from" defaultValue={fromStr} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-600">
          Do
          <input type="date" name="to" defaultValue={toStr} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Zobrazit</button>
        <div className="ml-auto flex gap-2">
          <a
            href={`/api/export?type=orders&${exportQs}`}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
          >
            ⬇ Účtenky (CSV)
          </a>
          <a
            href={`/api/export?type=products&${exportQs}`}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
          >
            ⬇ Produkty (CSV)
          </a>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tržba celkem" value={formatKc(t.totalHal)} big />
        <Stat label="Prodejů" value={String(t.count)} />
        <Stat label="Hotovost" value={formatKc(t.cashHal)} />
        <Stat label="Karta" value={formatKc(t.cardHal)} />
      </div>

      {/* Souhrn podle produktů */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-slate-900">Prodej podle produktů</h2>
        {products.length === 0 ? (
          <p className="p-6 text-center text-slate-400">V tomto období žádné prodeje.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-4 py-2 font-medium">Produkt</th>
                <th className="px-4 py-2 text-right font-medium">Kusů</th>
                <th className="px-4 py-2 text-right font-medium">Tržba</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId ?? p.name} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{p.qty}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatKc(p.revenueHal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-bold">
                <td className="px-4 py-2">Celkem</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {products.reduce((s, p) => s + p.qty, 0)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatKc(t.totalHal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* Účtenky */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-slate-900">
          Účtenky {orders.length > 0 && <span className="text-slate-400">({orders.length})</span>}
        </h2>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-slate-400">V tomto období žádné prodeje.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const dt = new Date(order.createdAt);
  const when = `${dt.toLocaleDateString("cs-CZ")} ${dt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <li className="px-4 py-3">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">#{order.number}</span>
            <span className="text-sm text-slate-500">{when}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                order.paymentMethod === "cash" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
              }`}
            >
              {order.paymentMethod === "cash" ? "Hotovost" : "Karta"}
            </span>
            {order.paymentStatus !== "paid" && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {order.paymentStatus}
              </span>
            )}
          </span>
          <span className="font-bold text-slate-900">{formatKc(order.totalHal)}</span>
        </summary>
        <ul className="mt-2 space-y-1 pl-1 text-sm text-slate-600">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between">
              <span>
                {it.quantity}× {it.name}
              </span>
              <span>{formatKc(it.lineHal)}</span>
            </li>
          ))}
          {order.cashGivenHal != null && (
            <li className="flex justify-between text-slate-400">
              <span>Přijato / vráceno</span>
              <span>
                {formatKc(order.cashGivenHal)} / {formatKc(order.cashGivenHal - order.totalHal)}
              </span>
            </li>
          )}
        </ul>
      </details>
    </li>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 font-extrabold text-slate-900 ${big ? "text-2xl" : "text-xl"}`}>{value}</p>
    </div>
  );
}
