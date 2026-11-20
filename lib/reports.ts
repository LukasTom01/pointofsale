// Agregace nad objednávkami pro přehledy a export. Do tržby se počítají jen
// zaplacené prodeje (paymentStatus === "paid", hotovost/karta). Objednávky
// „na účet“ se počítají zvlášť (hodnota zboží vydaného zdarma).

import type { Order } from "./types";

export interface Totals {
  count: number; // počet zaplacených prodejů (bez „na účet“)
  totalHal: number; // tržba (hotovost + karta)
  cashHal: number;
  cardHal: number;
  accountCount: number; // počet objednávek na účet
  accountHal: number; // hodnota zboží vydaného na účet
}

/** Zaplacený prodej, který se počítá do tržby (ne „na účet“). */
export function isSale(o: Order): boolean {
  return o.paymentStatus === "paid" && o.paymentMethod !== "account";
}

export function isAccount(o: Order): boolean {
  return o.paymentStatus === "paid" && o.paymentMethod === "account";
}

export function totals(orders: Order[]): Totals {
  const sales = orders.filter(isSale);
  const account = orders.filter(isAccount);
  return {
    count: sales.length,
    totalHal: sales.reduce((s, o) => s + o.totalHal, 0),
    cashHal: sales.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.totalHal, 0),
    cardHal: sales.filter((o) => o.paymentMethod === "card").reduce((s, o) => s + o.totalHal, 0),
    accountCount: account.length,
    accountHal: account.reduce((s, o) => s + o.totalHal, 0),
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
    if (!isSale(o)) continue;
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

export interface AccountSummaryRow {
  key: string;
  name: string;
  orders: number; // počet objednávek
  valueHal: number; // hodnota zboží
  items: { name: string; qty: number }[]; // co si vzal(a), seřazeno podle počtu
}

// Souhrn objednávek „na účet“ podle osob, seřazený podle hodnoty sestupně.
export function accountSummary(orders: Order[]): AccountSummaryRow[] {
  const map = new Map<string, AccountSummaryRow & { itemMap: Map<string, number> }>();
  for (const o of orders) {
    if (!isAccount(o)) continue;
    const name = o.accountName ?? "Neznámá osoba";
    const key = o.accountStaffId ?? `name:${name}`;
    const row = map.get(key) ?? { key, name, orders: 0, valueHal: 0, items: [], itemMap: new Map() };
    row.orders += 1;
    row.valueHal += o.totalHal;
    for (const it of o.items) row.itemMap.set(it.name, (row.itemMap.get(it.name) ?? 0) + it.quantity);
    map.set(key, row);
  }
  return [...map.values()]
    .map(({ itemMap, ...r }) => ({
      ...r,
      items: [...itemMap.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty),
    }))
    .sort((a, b) => b.valueHal - a.valueHal);
}
