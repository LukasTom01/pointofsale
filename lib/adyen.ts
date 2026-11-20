// Klient pro Adyen Terminal API (cloud).
//
// Model: server pošle platbu na Adyen endpoint, ten ji přepošle do terminálu
// (POIID), zákazník zaplatí kartou a Adyen vrátí výsledek. Používáme
// synchronní režim (/sync) – HTTP odpověď přijde, až je transakce dokončená.
//
// Výsledek platby má TŘI stavy:
//  - "approved" – terminál platbu schválil,
//  - "declined" – terminál ji jistě neprovedl (zamítnutí, zrušení, terminál
//    požadavek nepřijal),
//  - "unknown"  – odpověď nedorazila (timeout, výpadek sítě, chyba proxy).
//    Platba na terminálu mohla proběhnout! Stav se pak dohledá přes
//    TransactionStatus (viz resolveUnknownPayment), případně se platba zruší
//    přes AbortRequest.
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
  paymentTimeoutMs: number; // jak dlouho čekat na dokončení platby
}

export interface TerminalPaymentInput {
  amountHal: number; // částka v haléřích
  currency?: string; // výchozí CZK
  reference: string; // naše reference (např. číslo/čas objednávky)
  serviceId: string; // ServiceID požadavku – podle něj se dohledává stav
}

export type TerminalOutcome = "approved" | "declined" | "unknown";

export interface TerminalPaymentResult {
  outcome: TerminalOutcome;
  transactionRef?: string; // POI transaction ID z terminálu
  message?: string;
  raw?: unknown;
}

// Výchozí timeout platby: musí se vejít (i s následným dohledáním stavu)
// do limitu serverless funkce (maxDuration v app/api/orders/route.ts).
const DEFAULT_PAYMENT_TIMEOUT_MS = 90_000;
const SHORT_TIMEOUT_MS = 10_000; // status / abort

// Načte konfiguraci z prostředí. Vrací null, když není nastavená.
export function getAdyenConfig(): AdyenConfig | null {
  const simulate = process.env.ADYEN_SIMULATE === "1";
  const apiKey = process.env.ADYEN_API_KEY ?? "";
  const poiId = process.env.ADYEN_POI_ID ?? "";
  // V simulaci stačí zapnutý flag; jinak potřebujeme klíč i terminál.
  if (!simulate && (!apiKey || !poiId)) return null;
  const timeout = Number(process.env.ADYEN_TIMEOUT_MS);
  return {
    apiKey,
    poiId: poiId || "SIMULATOR-POI",
    saleId: process.env.ADYEN_SALE_ID || "pos-stand",
    environment: process.env.ADYEN_ENVIRONMENT === "live" ? "live" : "test",
    liveUrlPrefix: process.env.ADYEN_LIVE_PREFIX || undefined,
    simulate,
    paymentTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_PAYMENT_TIMEOUT_MS,
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

/** Náhodné ServiceID (max 10 znaků), unikátní pro každý požadavek. */
export function newServiceId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function header(cfg: AdyenConfig, category: string, serviceId: string) {
  return {
    ProtocolVersion: "3.0",
    MessageClass: "Service",
    MessageCategory: category,
    MessageType: "Request",
    SaleID: cfg.saleId,
    ServiceID: serviceId,
    POIID: cfg.poiId,
  };
}

type PostResult =
  | { kind: "ok"; status: number; data: unknown; text: string }
  | { kind: "not-sent"; message: string; raw: unknown } // spojení se vůbec nenavázalo
  | { kind: "lost"; message: string; raw: unknown }; // požadavek mohl dorazit, odpověď ne

// Chyby, u kterých je jisté, že požadavek neodešel (DNS, odmítnuté spojení).
const NOT_SENT_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"]);

async function post(cfg: AdyenConfig, body: unknown, timeoutMs: number): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(cfg), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-API-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { kind: "ok", status: res.status, data, text };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (!aborted && code && NOT_SENT_CODES.has(code)) {
      return { kind: "not-sent", message: "Adyen je nedostupný (žádné připojení).", raw: String(e) };
    }
    return {
      kind: "lost",
      message: aborted ? "Vypršel čas při čekání na terminál." : "Spojení s terminálem se přerušilo.",
      raw: String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Odešle platbu do terminálu a počká na výsledek. */
export async function terminalPayment(
  cfg: AdyenConfig,
  input: TerminalPaymentInput,
): Promise<TerminalPaymentResult> {
  const currency = input.currency ?? "CZK";
  const amount = Number((input.amountHal / 100).toFixed(2));

  // Simulace: přeskoč volání Adyenu, vrať schválení.
  if (cfg.simulate) {
    return {
      outcome: "approved",
      transactionRef: `SIM-${newServiceId()}`,
      message: "Simulovaná platba (ADYEN_SIMULATE=1).",
      raw: { simulated: true, amount, currency },
    };
  }

  const body = {
    SaleToPOIRequest: {
      MessageHeader: header(cfg, "Payment", input.serviceId),
      PaymentRequest: {
        SaleData: {
          SaleTransactionID: {
            TransactionID: input.reference,
            TimeStamp: new Date().toISOString(),
          },
        },
        PaymentTransaction: {
          AmountsReq: { Currency: currency, RequestedAmount: amount },
        },
      },
    },
  };

  const r = await post(cfg, body, cfg.paymentTimeoutMs);
  if (r.kind === "not-sent") return { outcome: "declined", message: r.message, raw: r.raw };
  if (r.kind === "lost") return { outcome: "unknown", message: r.message, raw: r.raw };

  // 401/403/400 = Adyen požadavek odmítl, do terminálu nic nešlo.
  if (r.status >= 400 && r.status < 500) {
    return {
      outcome: "declined",
      message: r.status === 401 || r.status === 403
        ? `Adyen odmítl přístup (HTTP ${r.status}) – zkontrolujte API klíč.`
        : `Chyba požadavku na Adyen (HTTP ${r.status}).`,
      raw: r.data ?? r.text,
    };
  }
  // 5xx / nečitelná odpověď: nevíme, jestli terminál platbu provedl.
  if (r.status >= 500 || r.data == null) {
    return { outcome: "unknown", message: `Neočekávaná odpověď (HTTP ${r.status}).`, raw: r.data ?? r.text };
  }

  return parsePaymentResponse(r.data);
}

type PaymentResponseShape = {
  Response?: { Result?: string; ErrorCondition?: string; AdditionalResponse?: string };
  POIData?: { POITransactionID?: { TransactionID?: string } };
};

function parsePaymentResponse(data: unknown): TerminalPaymentResult {
  const root = data as {
    SaleToPOIResponse?: { PaymentResponse?: PaymentResponseShape };
    SaleToPOIRequest?: { EventNotification?: { EventToNotify?: string; EventDetails?: string } };
  };

  // Terminál nedostupný / požadavek odmítnut ještě před platbou: Adyen místo
  // PaymentResponse vrací EventNotification.
  const ev = root.SaleToPOIRequest?.EventNotification;
  if (ev) {
    const detail = ev.EventDetails ? decodeAdditional(ev.EventDetails) : null;
    return {
      outcome: "declined",
      message: `Terminál požadavek nepřijal${detail ? `: ${detail}` : "."} Zkontrolujte, že je zapnutý a online.`,
      raw: data,
    };
  }

  const pr = root.SaleToPOIResponse?.PaymentResponse;
  if (!pr) return { outcome: "unknown", message: "Odpověď neobsahuje výsledek platby.", raw: data };
  return fromPaymentResponse(pr, data);
}

function fromPaymentResponse(pr: PaymentResponseShape, raw: unknown): TerminalPaymentResult {
  const result = pr.Response?.Result;
  const txId = pr.POIData?.POITransactionID?.TransactionID;
  if (result === "Success" || result === "Partial") {
    // Partial by u nás nastat neměl (nepovolujeme částečné platby) – bereme jako schválené.
    return { outcome: "approved", transactionRef: txId, raw };
  }
  const cond = pr.Response?.ErrorCondition;
  const add = pr.Response?.AdditionalResponse;
  const detail = add ? decodeAdditional(add) : null;
  return {
    outcome: "declined",
    transactionRef: txId,
    message: describeError(cond, detail),
    raw,
  };
}

// Srozumitelné hlášky pro obsluhu.
const ERROR_TEXTS: Record<string, string> = {
  Refusal: "Karta byla zamítnuta.",
  Aborted: "Platba byla zrušena na terminálu.",
  Cancel: "Zákazník platbu zrušil.",
  Busy: "Terminál je zaneprázdněný – dokončete nebo zrušte předchozí operaci.",
  DeviceOut: "Terminál není připojený.",
  NotAllowed: "Operace není na terminálu povolená.",
  InProgress: "Na terminálu stále probíhá jiná transakce.",
  UnavailableService: "Služba není na terminálu dostupná.",
  WrongPIN: "Zadán špatný PIN.",
  MessageFormat: "Chyba formátu požadavku.",
};

function describeError(cond?: string, detail?: string | null): string {
  const base = (cond && ERROR_TEXTS[cond]) || (cond ? `Platba zamítnuta (${cond}).` : "Platba zamítnuta.");
  return detail && detail !== base ? `${base} ${detail}` : base;
}

// AdditionalResponse bývá URL-encoded query string; zkusíme z něj vytáhnout message.
function decodeAdditional(add: string): string | null {
  try {
    const params = new URLSearchParams(add);
    return params.get("refusalReason") || params.get("message") || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dohledání stavu a zrušení platby
// ---------------------------------------------------------------------------

export interface StatusResult {
  // "final": platba skončila (outcome approved/declined);
  // "in-progress": na terminálu ještě běží; "unknown": nepodařilo se zjistit.
  state: "final" | "in-progress" | "unknown";
  payment?: TerminalPaymentResult;
  message?: string;
}

/** Zeptá se Adyenu na výsledek dřívější platby (podle jejího ServiceID). */
export async function transactionStatus(cfg: AdyenConfig, paymentServiceId: string): Promise<StatusResult> {
  if (cfg.simulate) {
    return { state: "final", payment: { outcome: "approved", transactionRef: `SIM-${paymentServiceId}` } };
  }
  const body = {
    SaleToPOIRequest: {
      MessageHeader: header(cfg, "TransactionStatus", newServiceId()),
      TransactionStatusRequest: {
        MessageReference: {
          SaleID: cfg.saleId,
          ServiceID: paymentServiceId,
          MessageCategory: "Payment",
        },
      },
    },
  };
  const r = await post(cfg, body, SHORT_TIMEOUT_MS);
  if (r.kind !== "ok" || r.status >= 400 || r.data == null) {
    return { state: "unknown", message: r.kind === "ok" ? `HTTP ${r.status}` : r.message };
  }

  const tsr = (r.data as {
    SaleToPOIResponse?: {
      TransactionStatusResponse?: {
        Response?: { Result?: string; ErrorCondition?: string };
        RepeatedMessageResponse?: {
          RepeatedResponseMessageBody?: { PaymentResponse?: PaymentResponseShape };
        };
      };
    };
  }).SaleToPOIResponse?.TransactionStatusResponse;
  if (!tsr) return { state: "unknown", message: "Odpověď bez TransactionStatusResponse." };

  if (tsr.Response?.Result === "Success") {
    const pr = tsr.RepeatedMessageResponse?.RepeatedResponseMessageBody?.PaymentResponse;
    if (!pr) return { state: "unknown", message: "Stav bez výsledku platby." };
    return { state: "final", payment: fromPaymentResponse(pr, r.data) };
  }
  const cond = tsr.Response?.ErrorCondition;
  if (cond === "InProgress") return { state: "in-progress" };
  if (cond === "NotFound") {
    // Terminál o platbě neví – nikdy ji nezačal, peníze se nestrhly.
    return {
      state: "final",
      payment: { outcome: "declined", message: "Platba na terminál nedorazila.", raw: r.data },
    };
  }
  return { state: "unknown", message: cond ?? "Neznámý stav." };
}

/** Požádá terminál o zrušení probíhající platby. Výsledek se neověřuje – vždy následuje dotaz na stav. */
export async function abortPayment(cfg: AdyenConfig, paymentServiceId: string): Promise<void> {
  if (cfg.simulate) return;
  const body = {
    SaleToPOIRequest: {
      MessageHeader: header(cfg, "Abort", newServiceId()),
      AbortRequest: {
        AbortReason: "MerchantAbort",
        MessageReference: {
          SaleID: cfg.saleId,
          ServiceID: paymentServiceId,
          MessageCategory: "Payment",
        },
      },
    },
  };
  await post(cfg, body, SHORT_TIMEOUT_MS);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Dohledá výsledek platby, na kterou nepřišla odpověď.
 *  1) zeptá se na stav,
 *  2) pokud platba na terminálu ještě běží, zruší ji (Abort) a zeptá se znovu,
 *  3) když se stav nepodaří zjistit, vrátí "unknown" – objednávka zůstane
 *     "pending" a stav se ověří později (tlačítko „Ověřit platbu“).
 */
export async function resolveUnknownPayment(
  cfg: AdyenConfig,
  paymentServiceId: string,
  opts: { attempts?: number; delayMs?: number; abortIfRunning?: boolean } = {},
): Promise<TerminalPaymentResult> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 2_000;
  let aborted = false;
  let last: StatusResult | null = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    last = await transactionStatus(cfg, paymentServiceId);
    if (last.state === "final" && last.payment) return last.payment;
    if (last.state === "in-progress" && opts.abortIfRunning !== false && !aborted) {
      await abortPayment(cfg, paymentServiceId);
      aborted = true;
    }
  }
  return {
    outcome: "unknown",
    message:
      last?.state === "in-progress"
        ? "Platba na terminálu stále probíhá."
        : "Stav platby se nepodařilo ověřit.",
  };
}
