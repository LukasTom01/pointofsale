import type { Order } from "../types";

// Data pro vytvoření objednávky (číslo účtenky přiděluje úložiště).
export interface NewOrderData {
  totalHal: number;
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  cardProvider?: Order["cardProvider"];
  cardRef?: Order["cardRef"];
  cardServiceId?: Order["cardServiceId"];
  paymentMessage?: Order["paymentMessage"];
  cashGivenHal?: Order["cashGivenHal"];
  accountStaffId?: Order["accountStaffId"];
  accountName?: Order["accountName"];
  staffName?: Order["staffName"];
  note?: Order["note"];
  items: Order["items"];
}

// Změna stavu platby u existující objednávky.
export interface OrderPaymentPatch {
  paymentStatus?: Order["paymentStatus"];
  cardRef?: Order["cardRef"];
  cardServiceId?: Order["cardServiceId"];
  paymentMessage?: Order["paymentMessage"];
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
  getOrder(orderId: string): Promise<Order | null>;
  updateOrderPayment(orderId: string, patch: OrderPaymentPatch): Promise<Order | null>;
  listOrders(opts?: { from?: Date; to?: Date; limit?: number }): Promise<Order[]>;
  listStaff(opts?: { activeOnly?: boolean }): Promise<import("../types").StaffMember[]>;
  getStaff(staffId: string): Promise<import("../types").StaffMember | null>;
  createStaff(input: { name: string; active?: boolean; sortOrder?: number }): Promise<import("../types").StaffMember>;
  updateStaff(
    staffId: string,
    patch: Partial<Pick<import("../types").StaffMember, "name" | "active" | "sortOrder">>,
  ): Promise<import("../types").StaffMember | null>;
  deleteStaff(staffId: string): Promise<boolean>;
  resetAll(): Promise<void>;
  ensureSchema(): Promise<void>;
}
