// Agregace nad objednávkami pro přehledy a export. Do souhrnů se počítají jen
// zaplacené objednávky (paymentStatus === "paid").

import type { Order } from "./types";

export interface Totals {
  count: number; // počet zaplacených účtenek
  totalHal: number;
  cashHal: number;
  cardHal: number;
}

export function totals(orders: Order[]): Totals {
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  return {
    count: paid.length,
    totalHal: paid.reduce((s, o) => s + o.totalHal, 0),
    cashHal: paid.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.totalHal, 0),
    cardHal: paid.filter((o) => o.paymentMethod === "card").reduce((s, o) => s + o.totalHal, 0),
  };
}

export interface ProductSummaryRow {
  productId: string | null;
  name: string;
  qty: number; // prodané kusy
  revenueHal: number; // tržba za produkt
}

// Součty prodejů po jednotlivých produktech, seřazené podle tržby sestupně.
export function productSummary(orders: Order[]): ProductSummaryRow[] {
  const map = new Map<string, ProductSummaryRow>();
  for (const o of orders) {
    if (o.paymentStatus !== "paid") continue;
    for (const it of o.items) {
      // Klíč podle productId; když chybí (smazaný produkt), podle názvu.
      const key = it.productId ?? `name:${it.name}`;
      const row = map.get(key) ?? {
        productId: it.productId ?? null,
        name: it.name,
        qty: 0,
        revenueHal: 0,
      };
      row.qty += it.quantity;
      row.revenueHal += it.lineHal;
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.revenueHal - a.revenueHal || b.qty - a.qty);
}
