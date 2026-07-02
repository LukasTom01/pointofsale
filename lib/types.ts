// Doménové typy pro stánkový POS.
// Všechny peněžní částky jsou v haléřích (celé číslo). 1 Kč = 100 haléřů.

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  color?: string; // hex barva dlaždice, např. "#f59e0b"
  createdAt: string; // ISO
}

export interface Product {
  id: string;
  name: string;
  priceHal: number; // cena v haléřích
  active: boolean;
  sortOrder: number;
  emoji?: string;
  categoryId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = "cash" | "card";
export type PaymentStatus = "paid" | "failed" | "canceled";
// "manual" = ruční potvrzení na terminálu; "adyen" = automatické odeslání
// do terminálu přes Adyen Terminal API.
export type CardProvider = "manual" | "adyen";

export interface OrderItem {
  productId?: string | null;
  name: string; // snapshot názvu
  priceHal: number; // snapshot jednotkové ceny
  quantity: number;
  lineHal: number; // priceHal * quantity
}

export interface Order {
  id: string;
  number: number; // pořadové číslo účtenky
  totalHal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cardProvider?: CardProvider | null;
  cardRef?: string | null; // reference transakce z terminálu
  cashGivenHal?: number | null;
  staffName?: string | null;
  note?: string | null;
  items: OrderItem[];
  createdAt: string;
}

// Tvar požadavku na vytvoření objednávky (z klienta).
export interface CreateOrderInput {
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  cardProvider?: CardProvider | null;
  cardRef?: string | null;
  cashGivenHal?: number | null;
  staffName?: string | null;
  note?: string | null;
}
