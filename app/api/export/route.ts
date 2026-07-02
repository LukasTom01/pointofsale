import { listOrders } from "@/lib/store";
import { resolveRange } from "@/lib/dateRange";
import { productSummary } from "@/lib/reports";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

// Kč z haléřů pro CSV: "130,00" (desetinná čárka, bez symbolu).
function money(hal: number): string {
  return (hal / 100).toFixed(2).replace(".", ",");
}

function csvField(value: string): string {
  if (/[";\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(rows: string[][]): string {
  // BOM kvůli správnému zobrazení diakritiky v Excelu; oddělovač ";" (CS Excel).
  return "﻿" + rows.map((r) => r.map(csvField).join(";")).join("\r\n") + "\r\n";
}

function ordersCsv(orders: Order[]): string {
  const header = ["Číslo", "Datum", "Čas", "Platba", "Stav", "Celkem", "Přijato", "Vráceno", "Položky"];
  const rows = orders.map((o) => {
    const d = new Date(o.createdAt);
    const datum = d.toLocaleDateString("cs-CZ");
    const cas = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    const polozky = o.items.map((it) => `${it.quantity}× ${it.name}`).join(" | ");
    const prijato = o.cashGivenHal != null ? money(o.cashGivenHal) : "";
    const vraceno = o.cashGivenHal != null ? money(o.cashGivenHal - o.totalHal) : "";
    return [
      String(o.number),
      datum,
      cas,
      o.paymentMethod === "cash" ? "Hotovost" : "Karta",
      o.paymentStatus,
      money(o.totalHal),
      prijato,
      vraceno,
      polozky,
    ];
  });
  return toCsv([header, ...rows]);
}

function productsCsv(orders: Order[]): string {
  const header = ["Produkt", "Počet kusů", "Tržba"];
  const rows = productSummary(orders).map((r) => [r.name, String(r.qty), money(r.revenueHal)]);
  return toCsv([header, ...rows]);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "products" ? "products" : "orders";
  const { fromStr, toStr, from, to } = resolveRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined,
  );
  const orders = await listOrders({ from, to });

  const csv = type === "products" ? productsCsv(orders) : ordersCsv(orders);
  const base = type === "products" ? "produkty" : "prodeje";
  const filename = `${base}_${fromStr}_${toStr}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
