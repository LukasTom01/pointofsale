import Link from "next/link";
import { listOrders, listProducts } from "@/lib/store";
import { formatKc } from "@/lib/money";

export const dynamic = "force-dynamic";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AdminHome() {
  const day = todayStr();
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const [products, todayOrders] = await Promise.all([
    listProducts(),
    listOrders({ from, to }),
  ]);
  const paid = todayOrders.filter((o) => o.paymentStatus === "paid");
  const total = paid.reduce((s, o) => s + o.totalHal, 0);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Tržba dnes" value={formatKc(total)} />
        <Stat label="Prodejů dnes" value={String(paid.length)} />
        <Stat label="Produktů" value={String(products.length)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/produkty"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"
        >
          <p className="text-2xl">🏷️</p>
          <p className="mt-2 text-lg font-bold text-slate-900">Produkty a kategorie</p>
          <p className="text-sm text-slate-500">Přidávejte, upravujte a mažte nabídku.</p>
        </Link>
        <Link
          href="/admin/prodeje"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"
        >
          <p className="text-2xl">📊</p>
          <p className="mt-2 text-lg font-bold text-slate-900">Přehled prodejů</p>
          <p className="text-sm text-slate-500">Denní tržby a seznam účtenek.</p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
