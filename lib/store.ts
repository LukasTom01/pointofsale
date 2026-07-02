// Souborové úložiště (JSON) za jednoduchým repository rozhraním.
//
// Proč JSON soubor a ne SQL/Prisma: prostředí neumí spolehlivě stahovat nativní
// binárky (Prisma engine, better-sqlite3 prebuilds). Tahle vrstva má stejné
// rozhraní jako by mělo repository nad DB, takže se dá později bez zásahu do
// zbytku appky vyměnit za Postgres/Prisma.
//
// Zápisy jsou serializované přes promisovou frontu, aby se dva požadavky
// nepřepsaly. Data drží singleton (přežije hot-reload v dev díky globalThis).

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Category, Order, Product } from "./types";

interface DbShape {
  categories: Category[];
  products: Product[];
  orders: Order[];
  orderSeq: number; // poslední použité číslo účtenky
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function emptyDb(): DbShape {
  return { categories: [], products: [], orders: [], orderSeq: 0 };
}

interface StoreState {
  db: DbShape | null;
  writeChain: Promise<unknown>;
}

// Singleton napříč hot-reloady.
const g = globalThis as unknown as { __posStore?: StoreState };
const state: StoreState = (g.__posStore ??= { db: null, writeChain: Promise.resolve() });

async function ensureLoaded(): Promise<DbShape> {
  if (state.db) return state.db;
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    state.db = { ...emptyDb(), ...parsed };
  } catch {
    state.db = emptyDb();
  }
  return state.db;
}

async function persist(db: DbShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE); // atomický zápis
}

// Serializovaná mutace: mutátor dostane db, může ji měnit, vrátí výsledek.
async function mutate<T>(fn: (db: DbShape) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await ensureLoaded();
    const result = await fn(db);
    await persist(db);
    return result;
  };
  const p = state.writeChain.then(run, run);
  // Řetěz nesmí uváznout na chybě jedné mutace.
  state.writeChain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

function id(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- Kategorie ----------

export async function listCategories(): Promise<Category[]> {
  const db = await ensureLoaded();
  return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createCategory(input: {
  name: string;
  color?: string;
  sortOrder?: number;
}): Promise<Category> {
  return mutate((db) => {
    const cat: Category = {
      id: id(),
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? db.categories.length,
      createdAt: nowIso(),
    };
    db.categories.push(cat);
    return cat;
  });
}

export async function updateCategory(
  catId: string,
  patch: Partial<Pick<Category, "name" | "color" | "sortOrder">>,
): Promise<Category | null> {
  return mutate((db) => {
    const cat = db.categories.find((c) => c.id === catId);
    if (!cat) return null;
    Object.assign(cat, patch);
    return cat;
  });
}

export async function deleteCategory(catId: string): Promise<boolean> {
  return mutate((db) => {
    const before = db.categories.length;
    db.categories = db.categories.filter((c) => c.id !== catId);
    // Produkty v kategorii osiří (categoryId = null), nemažou se.
    for (const p of db.products) if (p.categoryId === catId) p.categoryId = null;
    return db.categories.length < before;
  });
}

// ---------- Produkty ----------

export async function listProducts(opts?: { activeOnly?: boolean }): Promise<Product[]> {
  const db = await ensureLoaded();
  let items = [...db.products];
  if (opts?.activeOnly) items = items.filter((p) => p.active);
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs"));
}

export async function getProduct(productId: string): Promise<Product | null> {
  const db = await ensureLoaded();
  return db.products.find((p) => p.id === productId) ?? null;
}

export async function createProduct(input: {
  name: string;
  priceHal: number;
  categoryId?: string | null;
  emoji?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<Product> {
  return mutate((db) => {
    const prod: Product = {
      id: id(),
      name: input.name,
      priceHal: input.priceHal,
      categoryId: input.categoryId ?? null,
      emoji: input.emoji,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? db.products.length,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.products.push(prod);
    return prod;
  });
}

export async function updateProduct(
  productId: string,
  patch: Partial<Pick<Product, "name" | "priceHal" | "categoryId" | "emoji" | "active" | "sortOrder">>,
): Promise<Product | null> {
  return mutate((db) => {
    const prod = db.products.find((p) => p.id === productId);
    if (!prod) return null;
    Object.assign(prod, patch);
    prod.updatedAt = nowIso();
    return prod;
  });
}

export async function deleteProduct(productId: string): Promise<boolean> {
  return mutate((db) => {
    const before = db.products.length;
    db.products = db.products.filter((p) => p.id !== productId);
    return db.products.length < before;
  });
}

// ---------- Objednávky ----------

export interface NewOrderData {
  totalHal: number;
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  cardProvider?: Order["cardProvider"];
  cardRef?: Order["cardRef"];
  cashGivenHal?: Order["cashGivenHal"];
  staffName?: Order["staffName"];
  note?: Order["note"];
  items: Order["items"];
}

export async function createOrder(data: NewOrderData): Promise<Order> {
  return mutate((db) => {
    db.orderSeq += 1;
    const order: Order = {
      id: id(),
      number: db.orderSeq,
      totalHal: data.totalHal,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      cardProvider: data.cardProvider ?? null,
      cardRef: data.cardRef ?? null,
      cashGivenHal: data.cashGivenHal ?? null,
      staffName: data.staffName ?? null,
      note: data.note ?? null,
      items: data.items,
      createdAt: nowIso(),
    };
    db.orders.push(order);
    return order;
  });
}

export async function listOrders(opts?: { from?: Date; to?: Date; limit?: number }): Promise<Order[]> {
  const db = await ensureLoaded();
  let items = [...db.orders];
  if (opts?.from) items = items.filter((o) => new Date(o.createdAt) >= opts.from!);
  if (opts?.to) items = items.filter((o) => new Date(o.createdAt) < opts.to!);
  items.sort((a, b) => b.number - a.number);
  if (opts?.limit) items = items.slice(0, opts.limit);
  return items;
}
