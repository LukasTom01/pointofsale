// Klient pro Adyen Terminal API (cloud).
//
// Model: server pošle platbu na Adyen endpoint, ten ji přepošle do terminálu
// (POIID), zákazník zaplatí kartou a Adyen vrátí výsledek. Používáme
// synchronní režim (/sync) – HTTP odpověď přijde, až je transakce dokončená.
//
// DISH Pay běží na Adyenu; pokud DISH poskytne API klíč, merchant account a
// POIID k jejich terminálu, funguje tohle napojení rovnou na stávajícím
// DISH PAY NOW. Jinak platí pro vlastní Adyen účet + Adyen terminál.
//
// Pro vývoj bez hardwaru je k dispozici simulační režim (ADYEN_SIMULATE=1),
// který vrátí schválení bez volání Adyenu – ať jde otestovat celý průběh.

export interface AdyenConfig {
  apiKey: string;
  poiId: string; // ID terminálu, např. "V400m-123456789"
  saleId: string; // ID pokladny (naše volba)
  environment: "test" | "live";
  liveUrlPrefix?: string; // povinné pro live (z Adyen Customer Area)
  simulate: boolean;
}

export interface TerminalPaymentInput {
  amountHal: number; // částka v haléřích
  currency?: string; // výchozí CZK
  reference: string; // naše reference (např. číslo/čas objednávky)
}

export interface TerminalPaymentResult {
  approved: boolean;
  transactionRef?: string; // POI transaction ID z terminálu
  message?: string;
  raw?: unknown;
}

// Načte konfiguraci z prostředí. Vrací null, když není nastavená.
export function getAdyenConfig(): AdyenConfig | null {
  const simulate = process.env.ADYEN_SIMULATE === "1";
  const apiKey = process.env.ADYEN_API_KEY ?? "";
  const poiId = process.env.ADYEN_POI_ID ?? "";
  // V simulaci stačí zapnutý flag; jinak potřebujeme klíč i terminál.
  if (!simulate && (!apiKey || !poiId)) return null;
  return {
    apiKey,
    poiId: poiId || "SIMULATOR-POI",
    saleId: process.env.ADYEN_SALE_ID || "pos-stand",
    environment: process.env.ADYEN_ENVIRONMENT === "live" ? "live" : "test",
    liveUrlPrefix: process.env.ADYEN_LIVE_PREFIX || undefined,
    simulate,
  };
}

export function isAdyenConfigured(): boolean {
  return getAdyenConfig() !== null;
}

function endpoint(cfg: AdyenConfig): string {
  if (cfg.environment === "live") {
    if (!cfg.liveUrlPrefix) {
      throw new Error("Pro Adyen live režim chybí ADYEN_LIVE_PREFIX.");
    }
    return `https://${cfg.liveUrlPrefix}-terminal-api-live.adyen.com/sync`;
  }
  return "https://terminal-api-test.adyen.com/sync";
}

// Náhodné ServiceID (max 10 znaků), unikátní pro každý požadavek.
function serviceId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Odešle platbu do terminálu a počká na výsledek. */
export async function terminalPayment(
  cfg: AdyenConfig,
  input: TerminalPaymentInput,
): Promise<TerminalPaymentResult> {
  const currency = input.currency ?? "CZK";
  const amount = Number((input.amountHal / 100).toFixed(2));
  const timestamp = new Date().toISOString();

  // Simulace: přeskoč volání Adyenu, vrať schválení.
  if (cfg.simulate) {
    return {
      approved: true,
      transactionRef: `SIM-${serviceId()}`,
      message: "Simulovaná platba (ADYEN_SIMULATE=1).",
      raw: { simulated: true, amount, currency },
    };
  }

  const body = {
    SaleToPOIRequest: {
      MessageHeader: {
        ProtocolVersion: "3.0",
        MessageClass: "Service",
        MessageCategory: "Payment",
        MessageType: "Request",
        SaleID: cfg.saleId,
        ServiceID: serviceId(),
        POIID: cfg.poiId,
      },
      PaymentRequest: {
        SaleData: {
          SaleTransactionID: {
            TransactionID: input.reference,
            TimeStamp: timestamp,
          },
        },
        PaymentTransaction: {
          AmountsReq: {
            Currency: currency,
            RequestedAmount: amount,
          },
        },
      },
    },
  };

  // Platba na terminálu může trvat i desítky sekund – dlouhý timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch(endpoint(cfg), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-API-key": cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      approved: false,
      message: aborted ? "Vypršel čas při čekání na terminál." : "Terminál je nedostupný.",
      raw: String(e),
    };
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { approved: false, message: `Neočekávaná odpověď (HTTP ${res.status}).`, raw: text };
  }

  if (!res.ok) {
    return { approved: false, message: `Chyba Adyen (HTTP ${res.status}).`, raw: data };
  }

  return parsePaymentResponse(data);
}

function parsePaymentResponse(data: unknown): TerminalPaymentResult {
  // Bezpečná navigace do SaleToPOIResponse.PaymentResponse…
  const root = data as {
    SaleToPOIResponse?: {
      PaymentResponse?: {
        Response?: { Result?: string; ErrorCondition?: string; AdditionalResponse?: string };
        POIData?: { POITransactionID?: { TransactionID?: string } };
      };
    };
  };
  const pr = root.SaleToPOIResponse?.PaymentResponse;
  const result = pr?.Response?.Result;
  const txId = pr?.POIData?.POITransactionID?.TransactionID;

  if (result === "Success") {
    return { approved: true, transactionRef: txId, raw: data };
  }
  const cond = pr?.Response?.ErrorCondition;
  const add = pr?.Response?.AdditionalResponse;
  return {
    approved: false,
    transactionRef: txId,
    message: cond ? `Platba zamítnuta: ${cond}` : add ? decodeAdditional(add) : "Platba zamítnuta.",
    raw: data,
  };
}

// AdditionalResponse bývá URL-encoded query string; zkusíme z něj vytáhnout message.
function decodeAdditional(add: string): string {
  try {
    const params = new URLSearchParams(add);
    return params.get("message") || params.get("refusalReason") || "Platba zamítnuta.";
  } catch {
    return "Platba zamítnuta.";
  }
}
