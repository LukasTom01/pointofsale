// Výběr úložiště modulu Finance: Postgres (DATABASE_URL), jinak soubor data/finance.json.
import { fileFinStore } from "./store-file";
import { pgFinStore } from "./store-pg";

export const finStore = process.env.DATABASE_URL ? pgFinStore : fileFinStore;
