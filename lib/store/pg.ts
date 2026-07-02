// Postgres úložiště (Neon) – použije se, když je nastavené DATABASE_URL.
// Používá HTTP driver @neondatabase/serverless, ideální pro Vercel serverless.
//
// Časová razítka i id generujeme v JS (ISO string / uuid), aby chování přesně
// odpovídalo souborovému úložišti. Číslo účtenky přiděluje sekvence (SERIAL).

import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import type { Category, Order, OrderItem, Product } from "../types";
import type { NewOrderData } from "./shared";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL není nastavené.");
  return neon(url);
}

const id = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// --- Schéma (idempotentní, memoizované na proces) ---
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      color TEXT,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_hal INT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      emoji TEXT,
      category_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      number SERIAL UNIQUE,
      total_hal INT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      card_provider TEXT,
      card_ref TEXT,
      cash_given_hal INT,
      staff_name TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT,
      name TEXT NOT NULL,
      price_hal INT NOT NULL,
      quantity INT NOT NULL,
      line_hal INT NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id)`;
  })();
  return schemaReady;
}

// Typ tagované SQL funkce z neon() – uvolněný, ať neřešíme varianci generik.
type Sql = ReturnType<typeof neon>;

async function q<T = Record<string, unknown>>(run: (sql: Sql) => Promise<T>): Promise<T> {
  await ensureSchema();
  return run(db() as Sql);
}

// --- Mapování řádků na doménové typy ---
type Row = Record<string, unknown>;

function toCategory(r: Row): Category {
  return {
    id: r.id as string,
    name: r.name as string,
    sortOrder: Number(r.sort_order),
    color: (r.color as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function toProduct(r: Row): Product {
  return {
    id: r.id as string,
    name: r.name as string,
    priceHal: Number(r.price_hal),
    active: Boolean(r.active),
    sortOrder: Number(r.sort_order),
    emoji: (r.emoji as string) ?? undefined,
    categoryId: (r.category_id as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toOrder(r: Row, items: OrderItem[]): Order {
  return {
    id: r.id as string,
    number: Number(r.number),
    totalHal: Number(r.total_hal),
    paymentMethod: r.payment_method as Order["paymentMethod"],
    paymentStatus: r.payment_status as Order["paymentStatus"],
    cardProvider: (r.card_provider as Order["cardProvider"]) ?? null,
    cardRef: (r.card_ref as string) ?? null,
    cashGivenHal: r.cash_given_hal != null ? Number(r.cash_given_hal) : null,
    staffName: (r.staff_name as string) ?? null,
    note: (r.note as string) ?? null,
    items,
    createdAt: r.created_at as string,
  };
}

// --- Kategorie ---

export async function listCategories(): Promise<Category[]> {
  return q(async (sql) => {
    const rows = (await sql`SELECT * FROM categories ORDER BY sort_order ASC`) as Row[];
    return rows.map(toCategory);
  });
}

export async function createCategory(input: {
  name: string;
  color?: string;
  sortOrder?: number;
}): Promise<Category> {
  return q(async (sql) => {
    const cat: Category = {
      id: id(),
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? (await nextCategorySort(sql)),
      createdAt: nowIso(),
    };
    await sql`INSERT INTO categories (id, name, sort_order, color, created_at)
      VALUES (${cat.id}, ${cat.name}, ${cat.sortOrder}, ${cat.color ?? null}, ${cat.createdAt})`;
    return cat;
  });
}

async function nextCategorySort(sql: Sql): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS c FROM categories`) as Row[];
  return Number(rows[0].c);
}

export async function updateCategory(
  catId: string,
  patch: Partial<Pick<Category, "name" | "color" | "sortOrder">>,
): Promise<Category | null> {
  return q(async (sql) => {
    const rows = (await sql`SELECT * FROM categories WHERE id = ${catId}`) as Row[];
    if (rows.length === 0) return null;
    const cur = toCategory(rows[0]);
    const next = { ...cur, ...patch };
    await sql`UPDATE categories SET name = ${next.name}, color = ${next.color ?? null},
      sort_order = ${next.sortOrder} WHERE id = ${catId}`;
    return next;
  });
}

export async function deleteCategory(catId: string): Promise<boolean> {
  return q(async (sql) => {
    await sql`UPDATE products SET category_id = NULL WHERE category_id = ${catId}`;
    const rows = (await sql`DELETE FROM categories WHERE id = ${catId} RETURNING id`) as Row[];
    return rows.length > 0;
  });
}

// --- Produkty ---

export async function listProducts(opts?: { activeOnly?: boolean }): Promise<Product[]> {
  return q(async (sql) => {
    const rows = opts?.activeOnly
      ? ((await sql`SELECT * FROM products WHERE active = TRUE ORDER BY sort_order ASC, name ASC`) as Row[])
      : ((await sql`SELECT * FROM products ORDER BY sort_order ASC, name ASC`) as Row[]);
    return rows.map(toProduct);
  });
}

export async function getProduct(productId: string): Promise<Product | null> {
  return q(async (sql) => {
    const rows = (await sql`SELECT * FROM products WHERE id = ${productId}`) as Row[];
    return rows.length ? toProduct(rows[0]) : null;
  });
}

export async function createProduct(input: {
  name: string;
  priceHal: number;
  categoryId?: string | null;
  emoji?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<Product> {
  return q(async (sql) => {
    const countRows = (await sql`SELECT COUNT(*)::int AS c FROM products`) as Row[];
    const prod: Product = {
      id: id(),
      name: input.name,
      priceHal: input.priceHal,
      categoryId: input.categoryId ?? null,
      emoji: input.emoji,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? Number(countRows[0].c),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await sql`INSERT INTO products
      (id, name, price_hal, active, sort_order, emoji, category_id, created_at, updated_at)
      VALUES (${prod.id}, ${prod.name}, ${prod.priceHal}, ${prod.active}, ${prod.sortOrder},
        ${prod.emoji ?? null}, ${prod.categoryId}, ${prod.createdAt}, ${prod.updatedAt})`;
    return prod;
  });
}

export async function updateProduct(
  productId: string,
  patch: Partial<Pick<Product, "name" | "priceHal" | "categoryId" | "emoji" | "active" | "sortOrder">>,
): Promise<Product | null> {
  return q(async (sql) => {
    const rows = (await sql`SELECT * FROM products WHERE id = ${productId}`) as Row[];
    if (rows.length === 0) return null;
    const cur = toProduct(rows[0]);
    const next: Product = { ...cur, ...patch, updatedAt: nowIso() };
    await sql`UPDATE products SET
      name = ${next.name}, price_hal = ${next.priceHal}, active = ${next.active},
      sort_order = ${next.sortOrder}, emoji = ${next.emoji ?? null},
      category_id = ${next.categoryId ?? null}, updated_at = ${next.updatedAt}
      WHERE id = ${productId}`;
    return next;
  });
}

export async function deleteProduct(productId: string): Promise<boolean> {
  return q(async (sql) => {
    const rows = (await sql`DELETE FROM products WHERE id = ${productId} RETURNING id`) as Row[];
    return rows.length > 0;
  });
}

// --- Objednávky ---

export async function createOrder(data: NewOrderData): Promise<Order> {
  return q(async (sql) => {
    const orderId = id();
    const createdAt = nowIso();
    const inserted = (await sql`INSERT INTO orders
      (id, total_hal, payment_method, payment_status, card_provider, card_ref,
       cash_given_hal, staff_name, note, created_at)
      VALUES (${orderId}, ${data.totalHal}, ${data.paymentMethod}, ${data.paymentStatus},
        ${data.cardProvider ?? null}, ${data.cardRef ?? null}, ${data.cashGivenHal ?? null},
        ${data.staffName ?? null}, ${data.note ?? null}, ${createdAt})
      RETURNING number`) as Row[];

    for (const it of data.items) {
      await sql`INSERT INTO order_items
        (id, order_id, product_id, name, price_hal, quantity, line_hal)
        VALUES (${id()}, ${orderId}, ${it.productId ?? null}, ${it.name}, ${it.priceHal},
          ${it.quantity}, ${it.lineHal})`;
    }

    return {
      id: orderId,
      number: Number(inserted[0].number),
      totalHal: data.totalHal,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      cardProvider: data.cardProvider ?? null,
      cardRef: data.cardRef ?? null,
      cashGivenHal: data.cashGivenHal ?? null,
      staffName: data.staffName ?? null,
      note: data.note ?? null,
      items: data.items,
      createdAt,
    };
  });
}

export async function listOrders(opts?: {
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<Order[]> {
  return q(async (sql) => {
    const from = opts?.from?.toISOString() ?? null;
    const to = opts?.to?.toISOString() ?? null;
    const orderRows = (await sql`
      SELECT * FROM orders
      WHERE (${from}::text IS NULL OR created_at >= ${from})
        AND (${to}::text IS NULL OR created_at < ${to})
      ORDER BY number DESC
    `) as Row[];

    const limited = opts?.limit != null ? orderRows.slice(0, opts.limit) : orderRows;
    if (limited.length === 0) return [];

    const ids = limited.map((r) => r.id as string);
    const itemRows = (await sql`SELECT * FROM order_items WHERE order_id = ANY(${ids})`) as Row[];
    const byOrder = new Map<string, OrderItem[]>();
    for (const ir of itemRows) {
      const arr = byOrder.get(ir.order_id as string) ?? [];
      arr.push({
        productId: (ir.product_id as string) ?? null,
        name: ir.name as string,
        priceHal: Number(ir.price_hal),
        quantity: Number(ir.quantity),
        lineHal: Number(ir.line_hal),
      });
      byOrder.set(ir.order_id as string, arr);
    }
    return limited.map((r) => toOrder(r, byOrder.get(r.id as string) ?? []));
  });
}

export async function resetAll(): Promise<void> {
  await q(async (sql) => {
    await sql`TRUNCATE order_items, orders, products, categories RESTART IDENTITY CASCADE`;
  });
}
