import { listOrders } from "@/lib/store";
import { formatKc } from "@/lib/money";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ProdejePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day: dayParam } = await searchParams;
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayStr();
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const orders = await listOrders({ from, to });

  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const total = paid.reduce((s, o) => s + o.totalHal, 0);
  const cashTotal = paid.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.totalHal, 0);
  const cardTotal = paid.filter((o) => o.paymentMethod === "card").reduce((s, o) => s + o.totalHal, 0);

  return (
    <div className="grid gap-4">
      <form method="get" className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600">Den:</label>
        <input
          type="date"
          name="day"
          defaultValue={day}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Zobrazit</button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tržba celkem" value={formatKc(total)} big />
        <Stat label="Prodejů" value={String(paid.length)} />
        <Stat label="Hotovost" value={formatKc(cashTotal)} />
        <Stat label="Karta" value={formatKc(cardTotal)} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-slate-900">Účtenky</h2>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-slate-400">V tento den zatím žádné prodeje.</p>
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
  const time = new Date(order.createdAt).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="px-4 py-3">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex items-center gap-3">
            <span className="font-bold text-slate-900">#{order.number}</span>
            <span className="text-sm text-slate-500">{time}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                order.paymentMethod === "cash"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-sky-100 text-sky-700"
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
