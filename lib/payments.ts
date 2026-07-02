// Abstrakce platby kartou.
//
// Cíl: appka nezná konkrétní terminál. Dnes fungují dvě cesty:
//
//  1) "manual" – brigádník naťuká částku do stávajícího terminálu (DISH PAY NOW)
//     ručně a v appce potvrdí, že platba proběhla. Funguje s čímkoli, hned.
//
//  2) "dish" – automatické odeslání částky do terminálu přes DISH API.
//     DISH ale veřejné API pro terminál nenabízí; tenhle slot je připravený,
//     ale aktivní bude až po získání partnerského přístupu (viz .env.example).
//     Jakmile klíče budou, doplní se tělo `chargeViaDish` a nastaví se env.
//
// Přidání dalšího poskytovatele (SumUp/Square/Adyen) = přidat další větev sem;
// zbytek appky (UI, ukládání objednávky) se nemění.

import type { CardProvider } from "./types";

export interface CardChargeRequest {
  amountHal: number;
  orderRef?: string; // naše interní reference (např. číslo účtenky)
}

export interface CardChargeResult {
  status: "approved" | "declined";
  provider: CardProvider;
  transactionRef?: string; // reference z terminálu
  message?: string;
}

/** Je nakonfigurované automatické DISH napojení? */
export function isDishConfigured(): boolean {
  return Boolean(
    process.env.DISH_API_BASE && process.env.DISH_API_KEY && process.env.DISH_TERMINAL_ID,
  );
}

/**
 * Který způsob platby kartou je aktuálně aktivní.
 * Dokud není DISH nakonfigurované, používá se ruční potvrzení.
 */
export function activeCardProvider(): CardProvider {
  return isDishConfigured() ? "dish" : "manual";
}

/**
 * Odeslání platby do DISH terminálu. Připravený slot.
 *
 * Až bude k dispozici partnerské API, implementuje se zde volání:
 *   POST {DISH_API_BASE}/terminals/{DISH_TERMINAL_ID}/payments
 *   Authorization: Bearer {DISH_API_KEY}
 *   { amount, currency: "CZK", reference }
 * a následné pollování stavu transakce, dokud není approved/declined.
 */
export async function chargeViaDish(_req: CardChargeRequest): Promise<CardChargeResult> {
  if (!isDishConfigured()) {
    throw new Error(
      "DISH API není nakonfigurované. Doplňte DISH_API_BASE / DISH_API_KEY / DISH_TERMINAL_ID " +
        "a implementaci volání v lib/payments.ts. Zatím používejte ruční potvrzení.",
    );
  }
  // TODO: skutečné volání DISH API po získání partnerského přístupu.
  throw new Error("DISH napojení zatím není implementováno (čeká na partnerské API).");
}
