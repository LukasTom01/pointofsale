// Úložiště modulu Finance: obecné kolekce záznamů (JSON) + soubory dokladů.
import type { FinFile } from "./types";

export type Collection = "docs" | "categories" | "bank" | "settings";

export interface FinStore {
  list<T>(collection: Collection): Promise<T[]>;
  get<T>(collection: Collection, id: string): Promise<T | null>;
  put<T extends { id: string }>(collection: Collection, row: T): Promise<T>;
  putMany<T extends { id: string }>(collection: Collection, rows: T[]): Promise<void>;
  remove(collection: Collection, id: string): Promise<void>;

  listFiles(): Promise<FinFile[]>;
  getFile(id: string): Promise<{ meta: FinFile; data: Buffer } | null>;
  addFile(meta: Omit<FinFile, "id" | "createdAt">, data: Buffer): Promise<FinFile>;
  moveFiles(fromDocId: string, toDocId: string): Promise<void>;
  removeFile(id: string): Promise<void>;
}
