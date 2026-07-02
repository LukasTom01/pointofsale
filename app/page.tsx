import Link from "next/link";
import { listCategories, listProducts } from "@/lib/store";
import { activeCardProvider } from "@/lib/payments";
import Pos from "@/components/Pos";
import SeedButton from "@/components/SeedButton";

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
          <p className="text-lg text-slate-600">Zatím tu nejsou žádné produkty.</p>
          <SeedButton />
          <p className="text-sm text-slate-400">nebo si je přidejte ručně</p>
          <Link
            href="/admin/produkty"
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            Přidat produkty v administraci
          </Link>
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
