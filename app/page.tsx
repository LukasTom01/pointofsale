import Link from "next/link";
import { listCategories, listProducts } from "@/lib/store";
import { activeCardProvider } from "@/lib/payments";
import Pos from "@/components/Pos";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [categories, products] = await Promise.all([
    listCategories(),
    listProducts({ activeOnly: true }),
  ]);

  const empty = products.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg text-slate-600">
            Zatím tu nejsou žádné produkty.
          </p>
          <Link
            href="/admin/produkty"
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            Přidat produkty v administraci
          </Link>
          <p className="text-sm text-slate-400">
            Nebo spusťte <code className="rounded bg-slate-200 px-1">npm run seed</code> pro ukázková data.
          </p>
        </div>
      ) : (
        <Pos
          categories={categories}
          products={products}
          cardProvider={activeCardProvider()}
        />
      )}
    </div>
  );
}
