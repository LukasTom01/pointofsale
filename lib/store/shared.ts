import type { Order } from "../types";

// Data pro vytvoření objednávky (číslo účtenky přiděluje úložiště).
export interface NewOrderData {
  totalHal: number;
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  cardProvider?: Order["cardProvider"];
  cardRef?: Order["cardRef"];
  cashGivenHal?: Order["cashGivenHal"];
  staffName?: Order["staffName"];
  note?: Order["note"];
  items: Order["items"];
}

// Společné rozhraní obou úložišť (souborové i Postgres).
export interface Store {
  listCategories(): Promise<import("../types").Category[]>;
  createCategory(input: { name: string; color?: string; sortOrder?: number }): Promise<import("../types").Category>;
  updateCategory(
    catId: string,
    patch: Partial<Pick<import("../types").Category, "name" | "color" | "sortOrder">>,
  ): Promise<import("../types").Category | null>;
  deleteCategory(catId: string): Promise<boolean>;
  listProducts(opts?: { activeOnly?: boolean }): Promise<import("../types").Product[]>;
  getProduct(productId: string): Promise<import("../types").Product | null>;
  createProduct(input: {
    name: string;
    priceHal: number;
    categoryId?: string | null;
    emoji?: string;
    active?: boolean;
    sortOrder?: number;
  }): Promise<import("../types").Product>;
  updateProduct(
    productId: string,
    patch: Partial<
      Pick<import("../types").Product, "name" | "priceHal" | "categoryId" | "emoji" | "active" | "sortOrder">
    >,
  ): Promise<import("../types").Product | null>;
  deleteProduct(productId: string): Promise<boolean>;
  createOrder(data: NewOrderData): Promise<Order>;
  listOrders(opts?: { from?: Date; to?: Date; limit?: number }): Promise<Order[]>;
  resetAll(): Promise<void>;
  ensureSchema(): Promise<void>;
}
