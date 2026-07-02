import { listCategories, listProducts } from "@/lib/store";
import ProductsAdmin from "@/components/ProductsAdmin";

export const dynamic = "force-dynamic";

export default async function ProduktyPage() {
  const [categories, products] = await Promise.all([listCategories(), listProducts()]);
  return <ProductsAdmin initialCategories={categories} initialProducts={products} />;
}
