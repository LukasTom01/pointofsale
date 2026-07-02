// Naplní úložiště ukázkovými kategoriemi a produkty (stánek s občerstvením).
// Funguje pro obě úložiště: když je nastavené DATABASE_URL, seeduje Postgres,
// jinak souborové data/db.json.
// Spuštění: npm run seed   (POZOR: přepíše stávající data)

import { ensureSchema, resetAll } from "../lib/store";
import { seedSampleData } from "../lib/seedSample";

async function main() {
  await ensureSchema();
  await resetAll();
  const { categories, products } = await seedSampleData();
  console.log(
    `Seed hotový: ${categories} kategorie, ${products} produktů${process.env.DATABASE_URL ? " (Postgres)" : " (soubor)"}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
