// Sestavení a zaevidování objednávky. Ceny se počítají na serveru z uložených
// produktů – klientovi se nevěří.

import type { CreateOrderInput, Order, OrderItem } from "./types";
import { createOrder, getOrder, getProduct, getStaff, updateOrderPayment } from "./store";
import { activeCardProvider, chargeViaAdyen, verifyAdyenPayment, type CardChargeResult } from "./payments";
import { newServiceId } from "./adyen";

export class OrderError extends Error {}

/**
 * Platba odešla do terminálu, ale její výsledek se nepodařilo zjistit.
 * Objednávka je uložená se stavem "pending" – obsluha ji ověří později.
 */
export class PaymentPendingError extends OrderError {
  constructor(message: string, public order: Order) {
    super(message);
  }
}

export async function placeOrder(input: CreateOrderInput): Promise<Order> {
  if (!input.items || input.items.length === 0) {
    throw new OrderError("Objednávka je prázdná.");
  }
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "card" && input.paymentMethod !== "account") {
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

  // Na účet: zboží zdarma pro zaměstnance/brigádníka – eviduje se hodnota a osoba.
  if (input.paymentMethod === "account") {
    if (!input.accountStaffId) throw new OrderError("Vyberte, komu se objednávka zapisuje na účet.");
    const person = await getStaff(input.accountStaffId);
    if (!person || !person.active) throw new OrderError("Vybraná osoba neexistuje nebo není aktivní.");
    return createOrder({
      totalHal,
      paymentMethod: "account",
      paymentStatus: "paid",
      accountStaffId: person.id,
      accountName: person.name,
      staffName: input.staffName ?? null,
      note: input.note ?? null,
      items,
    });
  }

  // Platba.
  if (input.paymentMethod === "cash") {
    let cashGivenHal: Order["cashGivenHal"] = null;
    if (input.cashGivenHal != null) {
      if (input.cashGivenHal < totalHal) {
        throw new OrderError("Přijatá hotovost je nižší než částka k úhradě.");
      }
      cashGivenHal = input.cashGivenHal;
    }
    return createOrder({
      totalHal,
      paymentMethod: "cash",
      paymentStatus: "paid",
      cashGivenHal,
      staffName: input.staffName ?? null,
      note: input.note ?? null,
      items,
    });
  }

  // Karta. Způsob zpracování určuje server podle konfigurace – klientovi se
  // nevěří (jinak by šlo „zaplatit kartou“ bez terminálu).
  const provider = activeCardProvider();
  if (provider === "manual") {
    // Ruční potvrzení: platbu už provedl brigádník na terminálu.
    return createOrder({
      totalHal,
      paymentMethod: "card",
      paymentStatus: "paid",
      cardProvider: "manual",
      cardRef: input.cardRef ?? null,
      staffName: input.staffName ?? null,
      note: input.note ?? null,
      items,
    });
  }

  // Adyen: NEJDŘÍV uložit objednávku jako "pending" (i se ServiceID, podle
  // kterého jde stav platby dohledat), TEPRVE POTOM poslat platbu do terminálu.
  // Když uložení selže, z karty se nic nestrhne; když selže cokoli potom,
  // zůstane po platbě záznam, který jde ověřit.
  const serviceId = newServiceId();
  const pending = await createOrder({
    totalHal,
    paymentMethod: "card",
    paymentStatus: "pending",
    cardProvider: "adyen",
    cardServiceId: serviceId,
    staffName: input.staffName ?? null,
    note: input.note ?? null,
    items,
  });

  let result: CardChargeResult;
  try {
    result = await chargeViaAdyen({
      amountHal: totalHal,
      reference: `pos-${pending.number}`,
      serviceId,
    });
  } catch (e) {
    console.error("Chyba při platbě přes Adyen:", e);
    result = { status: "unknown", provider: "adyen", message: "Chyba při komunikaci s terminálem." };
  }
  return applyChargeResult(pending, result);
}

// Zapíše výsledek platby k objednávce. Při "unknown" nechá stav "pending".
async function applyChargeResult(order: Order, result: CardChargeResult): Promise<Order> {
  if (result.status === "unknown") {
    if (result.message) {
      await updateOrderPayment(order.id, { paymentMessage: result.message }).catch(() => null);
    }
    throw new PaymentPendingError(
      `${result.message ?? "Výsledek platby není známý."} Podívejte se na displej terminálu a stav ověřte.`,
      order,
    );
  }

  const status = result.status === "approved" ? "paid" : "failed";
  let updated: Order | null;
  try {
    updated = await updateOrderPayment(order.id, {
      paymentStatus: status,
      cardRef: result.transactionRef ?? null,
      paymentMessage: result.message ?? null,
    });
  } catch (e) {
    // Platba proběhla, ale zápis selhal – objednávka zůstává "pending" a
    // ověřením se stav doplní (Adyen si výsledek pamatuje).
    console.error("Nepodařilo se zapsat výsledek platby:", e);
    throw new PaymentPendingError(
      status === "paid"
        ? "Platba proběhla, ale nepodařilo se ji uložit. Zkuste ověřit platbu znovu."
        : "Výsledek platby se nepodařilo uložit. Zkuste ověřit platbu znovu.",
      order,
    );
  }
  if (status === "failed") {
    throw new OrderError(result.message ?? "Platba kartou byla zamítnuta.");
  }
  return updated ?? { ...order, paymentStatus: "paid", cardRef: result.transactionRef ?? null };
}

/**
 * Znovu ověří platbu objednávky ve stavu "pending" (dotazem na Adyen).
 * Vrací objednávku se zapsaným výsledkem; když je stav stále neznámý, hodí
 * PaymentPendingError.
 */
export async function verifyOrderPayment(orderId: string): Promise<Order> {
  const order = await getOrder(orderId);
  if (!order) throw new OrderError("Objednávka nenalezena.");
  if (order.paymentStatus !== "pending") return order; // už vyřešeno
  if (order.cardProvider !== "adyen" || !order.cardServiceId) {
    throw new OrderError("U této objednávky nelze platbu ověřit.");
  }
  let result: CardChargeResult;
  try {
    result = await verifyAdyenPayment(order.cardServiceId);
  } catch (e) {
    console.error("Chyba při ověřování platby:", e);
    result = { status: "unknown", provider: "adyen", message: "Chyba při komunikaci s Adyenem." };
  }
  return applyChargeResult(order, result);
}
