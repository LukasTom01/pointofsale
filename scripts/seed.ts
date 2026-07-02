// Naplní úložiště ukázkovými kategoriemi a produkty (stánek s občerstvením).
// Spuštění: npm run seed   (POZOR: přepíše stávající data/db.json)

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const now = new Date().toISOString();
const id = () => crypto.randomUUID();

const categories = [
  { id: id(), name: "Nápoje", color: "#0ea5e9", sortOrder: 0, createdAt: now },
  { id: id(), name: "Jídlo", color: "#f59e0b", sortOrder: 1, createdAt: now },
  { id: id(), name: "Sladké", color: "#ec4899", sortOrder: 2, createdAt: now },
];

const [napoje, jidlo, sladke] = categories;

let sort = 0;
const p = (
  name: string,
  kc: number,
  categoryId: string,
  emoji: string,
) => ({
  id: id(),
  name,
  priceHal: Math.round(kc * 100),
  active: true,
  sortOrder: sort++,
  emoji,
  categoryId,
  createdAt: now,
  updatedAt: now,
});

const products = [
  p("Kofola 0,5l", 40, napoje.id, "🥤"),
  p("Pivo 0,5l", 50, napoje.id, "🍺"),
  p("Voda 0,5l", 25, napoje.id, "💧"),
  p("Káva", 45, napoje.id, "☕"),
  p("Klobása", 70, jidlo.id, "🌭"),
  p("Hranolky", 60, jidlo.id, "🍟"),
  p("Langoš", 80, jidlo.id, "🥯"),
  p("Bramborák", 55, jidlo.id, "🥔"),
  p("Trdelník", 90, sladke.id, "🍩"),
  p("Zmrzlina", 45, sladke.id, "🍦"),
  p("Perník", 35, sladke.id, "🍪"),
];

const db = { categories, products, orders: [], orderSeq: 0 };

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  console.log(
    `Seed hotový: ${categories.length} kategorií, ${products.length} produktů -> ${DB_FILE}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
