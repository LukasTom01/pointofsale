// Souborové úložiště modulu Finance (lokální vývoj bez DATABASE_URL): data/finance.json.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { FinFile } from "./types";
import type { Collection, FinStore } from "./store-shared";

interface Db {
  records: Record<Collection, Record<string, unknown>>;
  files: (FinFile & { data: string })[];
}
const DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const FILE = path.join(DIR, "finance.json");
const empty = (): Db => ({ records: { docs: {}, categories: {}, bank: {}, settings: {} }, files: [] });

const g = globalThis as unknown as { __posFin?: { db: Db | null; chain: Promise<unknown> } };
const state = (g.__posFin ??= { db: null, chain: Promise.resolve() });

async function load(): Promise<Db> {
  if (state.db) return state.db;
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<Db>;
    state.db = { records: { ...empty().records, ...raw.records }, files: raw.files ?? [] };
  } catch {
    state.db = empty();
  }
  return state.db;
}
async function mutate<T>(fn: (db: Db) => T): Promise<T> {
  const run = async () => {
    const db = await load();
    const out = fn(db);
    await fs.mkdir(DIR, { recursive: true });
    const tmp = `${FILE}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db), "utf8");
    await fs.rename(tmp, FILE);
    return out;
  };
  const p = state.chain.then(run, run);
  state.chain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}
const copy = <T>(v: T): T => structuredClone(v);

export const fileFinStore: FinStore = {
  async list(c) {
    return copy(Object.values((await load()).records[c])) as never;
  },
  async get(c, id) {
    return copy(((await load()).records[c][id] as never) ?? null);
  },
  async put(c, row) {
    await mutate((db) => {
      db.records[c][row.id] = copy(row);
    });
    return row;
  },
  async putMany(c, rows) {
    await mutate((db) => {
      for (const r of rows) db.records[c][r.id] = copy(r);
    });
  },
  async remove(c, id) {
    await mutate((db) => {
      delete db.records[c][id];
    });
  },
  async listFiles() {
    return (await load()).files.map(({ data: _d, ...m }) => copy(m));
  },
  async getFile(id) {
    const f = (await load()).files.find((x) => x.id === id);
    if (!f) return null;
    const { data, ...meta } = f;
    return { meta: copy(meta), data: Buffer.from(data, "base64") };
  },
  async addFile(meta, data) {
    const row: FinFile = { ...meta, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    await mutate((db) => {
      db.files.push({ ...row, data: data.toString("base64") });
    });
    return row;
  },
  async moveFiles(from, to) {
    await mutate((db) => {
      for (const f of db.files) if (f.docId === from) f.docId = to;
    });
  },
  async removeFile(id) {
    await mutate((db) => {
      db.files = db.files.filter((f) => f.id !== id);
    });
  },
};
