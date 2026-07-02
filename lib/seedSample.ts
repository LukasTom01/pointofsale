// Vloží ukázkové kategorie a produkty přes rozhraní úložiště (bez mazání).
// Sdílené mezi CLI seedem (scripts/seed.ts) a API /api/seed.

import { createCategory, createProduct } from "./store";

export async function seedSampleData(): Promise<{ categories: number; products: number }> {
  const napoje = await createCategory({ name: "Nápoje", color: "#0ea5e9", sortOrder: 0 });
  const jidlo = await createCategory({ name: "Jídlo", color: "#f59e0b", sortOrder: 1 });
  const sladke = await createCategory({ name: "Sladké", color: "#ec4899", sortOrder: 2 });

  const items: [string, number, string, string][] = [
    ["Kofola 0,5l", 40, napoje.id, "🥤"],
    ["Pivo 0,5l", 50, napoje.id, "🍺"],
    ["Voda 0,5l", 25, napoje.id, "💧"],
    ["Káva", 45, napoje.id, "☕"],
    ["Klobása", 70, jidlo.id, "🌭"],
    ["Hranolky", 60, jidlo.id, "🍟"],
    ["Langoš", 80, jidlo.id, "🥯"],
    ["Bramborák", 55, jidlo.id, "🥔"],
    ["Trdelník", 90, sladke.id, "🍩"],
    ["Zmrzlina", 45, sladke.id, "🍦"],
    ["Perník", 35, sladke.id, "🍪"],
  ];

  let sortOrder = 0;
  for (const [name, kc, categoryId, emoji] of items) {
    await createProduct({ name, priceHal: Math.round(kc * 100), categoryId, emoji, sortOrder: sortOrder++ });
  }

  return { categories: 3, products: items.length };
}
