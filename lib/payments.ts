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
import {
  getAdyenConfig,
  isAdyenConfigured,
  resolveUnknownPayment,
  terminalPayment,
  type TerminalOutcome,
} from "./adyen";

export interface CardChargeRequest {
  amountHal: number;
  reference: string; // naše interní reference (např. číslo účtenky / čas)
  serviceId: string; // ServiceID požadavku (uložené u objednávky předem)
}

export interface CardChargeResult {
  // "unknown" = odpověď z terminálu nedorazila a stav se nepodařilo dohledat.
  status: TerminalOutcome;
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

function requireAdyen() {
  const cfg = getAdyenConfig();
  if (!cfg) {
    throw new Error(
      "Adyen není nakonfigurovaný. Doplňte ADYEN_API_KEY a ADYEN_POI_ID (nebo ADYEN_SIMULATE=1).",
    );
  }
  return cfg;
}

/**
 * Odeslání platby do terminálu přes Adyen Terminal API.
 * Když odpověď nedorazí, rovnou se pokusí stav dohledat (a případně platbu
 * na terminálu zrušit), aby obsluha nemusela nic řešit.
 */
export async function chargeViaAdyen(req: CardChargeRequest): Promise<CardChargeResult> {
  const cfg = requireAdyen();
  let result = await terminalPayment(cfg, {
    amountHal: req.amountHal,
    reference: req.reference,
    serviceId: req.serviceId,
  });
  if (result.outcome === "unknown") {
    const resolved = await resolveUnknownPayment(cfg, req.serviceId, { abortIfRunning: true });
    result = resolved.outcome === "unknown"
      ? { ...resolved, message: `${result.message} ${resolved.message ?? ""}`.trim() }
      : resolved;
  }
  return {
    status: result.outcome,
    provider: "adyen",
    transactionRef: result.transactionRef,
    message: result.message,
  };
}

/** Dodatečné ověření platby, jejíž výsledek nebyl jistý (bez rušení platby). */
export async function verifyAdyenPayment(serviceId: string): Promise<CardChargeResult> {
  const cfg = requireAdyen();
  const r = await resolveUnknownPayment(cfg, serviceId, { attempts: 1, abortIfRunning: false });
  return { status: r.outcome, provider: "adyen", transactionRef: r.transactionRef, message: r.message };
}
