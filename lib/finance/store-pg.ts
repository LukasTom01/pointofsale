// Postgres úložiště modulu Finance (tabulky fin_records a fin_files, vytvoří se samy).
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import type { FinFile } from "./types";
import type { FinStore } from "./store-shared";

type Row = Record<string, unknown>;
type Sql = ReturnType<typeof neon>;
const db = (): Sql => neon(process.env.DATABASE_URL!);

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS fin_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS fin_files (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fin_files_doc ON fin_files(doc_id)`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
async function q<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  await ensure();
  return fn(db());
}
const toFile = (r: Row): FinFile => ({
  id: String(r.id),
  docId: String(r.doc_id),
  name: String(r.name),
  mime: String(r.mime),
  size: Number(r.size),
  createdAt: String(r.created_at),
});

export const pgFinStore: FinStore = {
  async list(collection) {
    return q(async (sql) => ((await sql`SELECT data FROM fin_records WHERE collection = ${collection}`) as Row[]).map((r) => r.data as never));
  },
  async get(collection, id) {
    return q(async (sql) => {
      const rows = (await sql`SELECT data FROM fin_records WHERE collection = ${collection} AND id = ${id}`) as Row[];
      return (rows[0]?.data as never) ?? null;
    });
  },
  async put(collection, row) {
    await q(
      (sql) => sql`INSERT INTO fin_records (collection, id, data) VALUES (${collection}, ${row.id}, ${JSON.stringify(row)}::jsonb)
        ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    );
    return row;
  },
  async putMany(collection, rows) {
    for (const row of rows) await pgFinStore.put(collection, row);
  },
  async remove(collection, id) {
    await q((sql) => sql`DELETE FROM fin_records WHERE collection = ${collection} AND id = ${id}`);
  },

  async listFiles() {
    return q(async (sql) =>
      ((await sql`SELECT id, doc_id, name, mime, size, created_at FROM fin_files ORDER BY created_at`) as Row[]).map(toFile),
    );
  },
  async getFile(id) {
    return q(async (sql) => {
      const rows = (await sql`SELECT * FROM fin_files WHERE id = ${id}`) as Row[];
      return rows[0] ? { meta: toFile(rows[0]), data: Buffer.from(String(rows[0].data), "base64") } : null;
    });
  },
  async addFile(meta, data) {
    const row: FinFile = { ...meta, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    await q(
      (sql) => sql`INSERT INTO fin_files (id, doc_id, name, mime, size, data, created_at)
        VALUES (${row.id}, ${row.docId}, ${row.name}, ${row.mime}, ${row.size}, ${data.toString("base64")}, ${row.createdAt})`,
    );
    return row;
  },
  async moveFiles(fromDocId, toDocId) {
    await q((sql) => sql`UPDATE fin_files SET doc_id = ${toDocId} WHERE doc_id = ${fromDocId}`);
  },
  async removeFile(id) {
    await q((sql) => sql`DELETE FROM fin_files WHERE id = ${id}`);
  },
};
