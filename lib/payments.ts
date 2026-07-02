// Abstrakce platby kartou.
//
// Dvě cesty:
//
//  1) "manual" – brigádník naťuká částku do terminálu ručně a v appce potvrdí.
//     Funguje s čímkoli (i se stávajícím DISH PAY NOW), hned, bez integrace.
//
//  2) "adyen" – automatické odeslání částky do terminálu přes Adyen Terminal API
//     (cloud). Aktivní, jakmile je nakonfigurované (viz lib/adyen.ts / .env).
//     DISH Pay běží na Adyenu, takže při poskytnutí přístupu od DISH lze použít
//     přímo stávající terminál; jinak vlastní Adyen účet + Adyen terminál.
//
// Přidání dalšího poskytovatele = přidat další větev; zbytek appky se nemění.

import type { CardProvider } from "./types";
import { getAdyenConfig, isAdyenConfigured, terminalPayment } from "./adyen";

export interface CardChargeRequest {
  amountHal: number;
  reference: string; // naše interní reference (např. číslo účtenky / čas)
}

export interface CardChargeResult {
  status: "approved" | "declined";
  provider: CardProvider;
  transactionRef?: string;
  message?: string;
}

/**
 * Který způsob platby kartou je aktuálně aktivní.
 * Dokud není Adyen nakonfigurovaný, používá se ruční potvrzení.
 */
export function activeCardProvider(): CardProvider {
  return isAdyenConfigured() ? "adyen" : "manual";
}

/** Odeslání platby do terminálu přes Adyen Terminal API. */
export async function chargeViaAdyen(req: CardChargeRequest): Promise<CardChargeResult> {
  const cfg = getAdyenConfig();
  if (!cfg) {
    throw new Error(
      "Adyen není nakonfigurovaný. Doplňte ADYEN_API_KEY a ADYEN_POI_ID (nebo ADYEN_SIMULATE=1).",
    );
  }
  const result = await terminalPayment(cfg, {
    amountHal: req.amountHal,
    reference: req.reference,
  });
  return {
    status: result.approved ? "approved" : "declined",
    provider: "adyen",
    transactionRef: result.transactionRef,
    message: result.message,
  };
}
