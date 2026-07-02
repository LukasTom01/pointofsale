// Sestavení a zaevidování objednávky. Ceny se počítají na serveru z uložených
// produktů – klientovi se nevěří.

import type { CreateOrderInput, Order, OrderItem } from "./types";
import { createOrder, getProduct } from "./store";
import { activeCardProvider, chargeViaDish } from "./payments";

export class OrderError extends Error {}

export async function placeOrder(input: CreateOrderInput): Promise<Order> {
  if (!input.items || input.items.length === 0) {
    throw new OrderError("Objednávka je prázdná.");
  }
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "card") {
    throw new OrderError("Neplatný způsob platby.");
  }

  // Sestav položky z aktuálních produktů (ceny snapshotujeme).
  const items: OrderItem[] = [];
  let totalHal = 0;
  for (const line of input.items) {
    const qty = Math.trunc(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new OrderError("Neplatný počet kusů.");
    }
    const product = await getProduct(line.productId);
    if (!product) throw new OrderError(`Produkt nenalezen: ${line.productId}`);
    const lineHal = product.priceHal * qty;
    items.push({
      productId: product.id,
      name: product.name,
      priceHal: product.priceHal,
      quantity: qty,
      lineHal,
    });
    totalHal += lineHal;
  }

  // Platba.
  let paymentStatus: Order["paymentStatus"] = "paid";
  let cardProvider: Order["cardProvider"] = null;
  let cardRef: Order["cardRef"] = input.cardRef ?? null;
  let cashGivenHal: Order["cashGivenHal"] = null;

  if (input.paymentMethod === "cash") {
    if (input.cashGivenHal != null) {
      if (input.cashGivenHal < totalHal) {
        throw new OrderError("Přijatá hotovost je nižší než částka k úhradě.");
      }
      cashGivenHal = input.cashGivenHal;
    }
  } else {
    // Karta.
    cardProvider = input.cardProvider ?? activeCardProvider();
    if (cardProvider === "dish") {
      // Automatické odeslání do terminálu (aktivní až po nakonfigurování DISH).
      const result = await chargeViaDish({ amountHal: totalHal });
      paymentStatus = result.status === "approved" ? "paid" : "failed";
      cardRef = result.transactionRef ?? cardRef;
      if (paymentStatus !== "paid") {
        throw new OrderError(result.message ?? "Platba kartou byla zamítnuta.");
      }
    } else {
      // Ruční potvrzení: platbu už provedl brigádník na terminálu.
      cardProvider = "manual";
    }
  }

  return createOrder({
    totalHal,
    paymentMethod: input.paymentMethod,
    paymentStatus,
    cardProvider,
    cardRef,
    cashGivenHal,
    staffName: input.staffName ?? null,
    note: input.note ?? null,
    items,
  });
}
