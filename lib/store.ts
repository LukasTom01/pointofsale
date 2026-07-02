// Přepínač úložiště: když je nastavené DATABASE_URL, použije se Postgres (Neon),
// jinak souborové JSON úložiště (lokální vývoj). Obě mají stejné rozhraní, takže
// zbytek aplikace neřeší, kam se ukládá.

import * as fileStore from "./store/file";
import * as pgStore from "./store/pg";

export type { NewOrderData } from "./store/shared";

const usePg = Boolean(process.env.DATABASE_URL);
const impl = usePg ? pgStore : fileStore;

export const listCategories = impl.listCategories;
export const createCategory = impl.createCategory;
export const updateCategory = impl.updateCategory;
export const deleteCategory = impl.deleteCategory;

export const listProducts = impl.listProducts;
export const getProduct = impl.getProduct;
export const createProduct = impl.createProduct;
export const updateProduct = impl.updateProduct;
export const deleteProduct = impl.deleteProduct;

export const createOrder = impl.createOrder;
export const listOrders = impl.listOrders;

export const resetAll = impl.resetAll;
export const ensureSchema = impl.ensureSchema;
