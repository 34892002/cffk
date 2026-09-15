import type { PerpayConfig } from "@/lib/config-schemas";
import type { PaymentQueryResult, PaymentNotifyResult } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MERCHANT_NO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CHECKOUT_TOKEN = /^pct1_[A-Za-z0-9_-]{43}$/;
const MAX_RESPONSE_BYTES = 256 * 1024;

// PerPay adds a unique offset for ledger matching; only the requested amount enters cffk.
function paymentAmounts(value: Record<string, unknown>, requireReceived = true) {
  const requested = value.requested_amount_cents;
  const payable = value.payable_amount_cents;
  const receivedValue = value.received_amount_cents;
  const received = receivedValue === null || receivedValue === undefined ? null : receivedValue;
  if (typeof requested !== "number" || typeof payable !== "number" || !Number.isSafeInteger(requested) || requested < 1 || !Number.isSafeInteger(payable) || payable <= requested) return null;
  if (received !== null && (typeof received !== "number" || !Number.isSafeInteger(received) || received !== payable)) return null;
  if (requireReceived && received === null) return null;
  return { requested, payable, received };
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array) {
  return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
}

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function readResponseJson(response: Response) {
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("PERPAY_INVALID_RESPONSE");
  if (!response.body) throw new Error("PERPAY_INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("PERPAY_RESPONSE_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>; } catch { throw new Error("PERPAY_INVALID_RESPONSE"); }
}

function safeApiCode(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value.toUpperCase().replace(/-/g, "_") : "REQUEST_FAILED";
}

function targetPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function hasUnsafeCollectionCodeCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0xd800 && code <= 0xdfff) || code <= 0x1f || code === 0x7f || value[index] === "\\" || /\s/.test(value[index]!)) return true;
  }
  return false;
}

function collectionCode(value: unknown) {
  if (typeof value !== "string" || new TextEncoder().encode(value).length > 2331 || hasUnsafeCollectionCodeCharacters(value) || !/^https:\/\/qr\.alipay\.com\/[A-Za-z0-9_-]+(?:\?[^#]*)?$/i.test(value)) return null;
  return value;
}

async function request(config: PerpayConfig, method: string, path: string, body?: unknown) {
  const target = targetPath(path);
  const bytes = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signature = await hmac(config.apiSecret, ["PERPAY-HMAC-SHA256", "v1", method.toUpperCase(), target, timestamp, nonce, "default", await sha256(bytes)].join("\n"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    // Workers supports manual, not error, redirect handling.
    const response = await fetch(`${config.baseUrl}${target}`, {
      method: method.toUpperCase(),
      headers: { "content-type": "application/json", "X-PerPay-Client-Id": "default", "X-PerPay-Timestamp": timestamp, "X-PerPay-Nonce": nonce, "X-PerPay-Signature-Version": "v1", "X-PerPay-Signature": signature },
      ...(bytes.length ? { body: bytes } : {}), redirect: "manual", signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) throw new Error("PERPAY_REDIRECT_REJECTED");
    const payload = await readResponseJson(response);
    if (!response.ok) {
      const error = payload.error as Record<string, unknown> | undefined;
      throw new Error(`PERPAY_API_${response.status}_${safeApiCode(error?.code)}`);
    }
    if (!payload.data || typeof payload.data !== "object") throw new Error("PERPAY_REQUEST_FAILED");
    return payload.data as Record<string, unknown>;
  } finally { clearTimeout(timeout); }
}

function result(values: Partial<PaymentNotifyResult> & Pick<PaymentNotifyResult, "verified" | "status" | "message">): PaymentNotifyResult {
  return { provider: "PERPAY", ...values };
}

export function createPerpayAdapter(config: PerpayConfig) {
  return {
    create: async (input: { orderNo: string; amount: number; subject: string; notifyUrl: string; returnUrl: string }) => {
      const requestBody = { idempotency_key: `cffk:${input.orderNo}`, merchant_order_no: input.orderNo, amount_cents: input.amount, product_name: input.subject, ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}), ...(input.returnUrl ? { return_url: input.returnUrl } : {}) };
      const data = await request(config, "POST", "/api/v1/orders", requestBody);
      const checkout = data.checkout as { checkout_url?: unknown; token?: unknown } | undefined;
      if (!checkout || typeof checkout.checkout_url !== "string" || !checkout.checkout_url) throw new Error("PERPAY_CREATE_CHECKOUT_MISSING");
      const url = new URL(checkout.checkout_url);
      if (url.origin !== config.baseUrl || url.username || url.password || url.search || url.hash || !/^\/checkout\/pct1_[A-Za-z0-9_-]{43}$/.test(url.pathname)) throw new Error("PERPAY_CREATE_CHECKOUT_URL_INVALID");
      if (typeof data.order_id !== "string" || !UUID.test(data.order_id)) throw new Error("PERPAY_CREATE_ORDER_ID_INVALID");
      if (typeof checkout.token !== "string" || !CHECKOUT_TOKEN.test(checkout.token)) throw new Error("PERPAY_CREATE_CHECKOUT_TOKEN_INVALID");
      const state = await request(config, "GET", `/api/public/v1/checkouts/${checkout.token}`);
      const instructions = state.payment_instructions as { payable_amount_cents?: unknown; currency?: unknown; collection_code_payload?: unknown } | undefined;
      const payableAmount = instructions?.payable_amount_cents;
      const stateCheckout = state.checkout as Record<string, unknown> | undefined;
      const statePayment = state.payment as Record<string, unknown> | undefined;
      const qrCode = collectionCode(instructions?.collection_code_payload);
      if (!instructions || state.merchant_order_no !== input.orderNo || state.requested_amount_cents !== input.amount || state.currency !== "CNY" || statePayment?.status !== "UNPAID" || stateCheckout?.status !== "OPEN" || instructions.currency !== "CNY" || typeof payableAmount !== "number" || !Number.isSafeInteger(payableAmount) || payableAmount <= input.amount || !qrCode) throw new Error("PERPAY_CREATE_CHECKOUT_STATE_INVALID");
      return { mode: "qr" as const, qrCode, paymentOrderNo: data.order_id, payableAmount };
    },
    verify: async (input: { payload: Record<string, string>; rawBody?: string; rawBodyBytes?: Uint8Array; headers?: Headers }) => {
      const headers = input.headers;
      const version = headers?.get("X-PerPay-Webhook-Version");
      const keyId = headers?.get("X-PerPay-Webhook-Key-Id");
      const timestamp = headers?.get("X-PerPay-Webhook-Timestamp");
      const deliveryId = headers?.get("X-PerPay-Webhook-Delivery-Id");
      const eventId = headers?.get("X-PerPay-Webhook-Event-Id");
      const attempt = headers?.get("X-PerPay-Webhook-Attempt");
      const receivedSignature = headers?.get("X-PerPay-Webhook-Signature");
      const bodyBytes = input.rawBodyBytes ?? new TextEncoder().encode(input.rawBody ?? "");
      if (version !== "1" || !keyId || !UUID.test(keyId) || !deliveryId || !UUID.test(deliveryId) || !eventId || !UUID.test(eventId) || !timestamp || !/^[1-9][0-9]*$/.test(timestamp) || !Number.isSafeInteger(Number(timestamp)) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !attempt || !/^[1-9][0-9]{0,8}$/.test(attempt) || !receivedSignature || !/^v1=[0-9a-f]{64}$/.test(receivedSignature)) return result({ verified: false, status: "FAILED", message: "PERPAY_WEBHOOK_INVALID" });
      const expected = `v1=${await hmac(config.webhookSecret, ["perpay:webhook:v1", keyId, timestamp, deliveryId, eventId, attempt, await sha256(bodyBytes)].join("\n"))}`;
      if (!constantTimeEqual(receivedSignature, expected)) return result({ verified: false, status: "FAILED", message: "PERPAY_WEBHOOK_VERIFY_FAILED" });
      let event: Record<string, unknown>;
      try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes)); } catch { return result({ verified: false, status: "FAILED", message: "PERPAY_WEBHOOK_INVALID" }); }
      const eventType = typeof event.event_type === "string" ? event.event_type : "";
      if (event.schema !== "perpay:outbox-event:v2" || event.event_id !== eventId || !["PAYMENT_CONFIRMED", "PAYMENT_DISPUTED", "REFUND_UPDATED"].includes(eventType) || !UUID.test(String(event.order_id ?? "")) || !MERCHANT_NO.test(String(event.merchant_order_no ?? "")) || event.currency !== "CNY") return result({ verified: false, status: "FAILED", message: "PERPAY_WEBHOOK_INVALID" });
      if (eventType === "REFUND_UPDATED") {
        // cffk does not mutate payment state for PerPay refunds.
        return result({ verified: true, orderNo: String(event.merchant_order_no), paymentOrderNo: String(event.order_id), currency: "CNY", status: "PENDING", message: "PERPAY_REFUND_UPDATED" });
      }
      const amounts = paymentAmounts(event);
      if (!amounts) return result({ verified: false, status: "FAILED", message: "PERPAY_WEBHOOK_AMOUNT_INVALID" });
      return result({ verified: true, orderNo: String(event.merchant_order_no), paymentOrderNo: String(event.order_id), amount: amounts.requested, currency: "CNY", status: eventType === "PAYMENT_CONFIRMED" && event.payment_status === "CONFIRMED" ? "PAID" : "FAILED", message: "PERPAY_WEBHOOK" });
    },
    query: async (input: { orderNo: string; paymentOrderNo?: string; amount: number }): Promise<PaymentQueryResult> => {
      const path = input.paymentOrderNo && UUID.test(input.paymentOrderNo) ? `/api/v1/orders/${input.paymentOrderNo}` : `/api/v1/orders/by-merchant-no/${encodeURIComponent(input.orderNo)}`;
      try {
        const data = await request(config, "GET", path);
        if (data.merchant_order_no !== input.orderNo || data.currency !== "CNY") return { provider: "PERPAY", verified: false, orderNo: input.orderNo, paymentOrderNo: data.order_id, status: "PENDING", message: "PERPAY_QUERY_FAILED" };
        // Unpaid orders legitimately have no received amount yet.
        const amounts = paymentAmounts(data, false);
        if (!amounts) return { provider: "PERPAY", verified: false, orderNo: input.orderNo, paymentOrderNo: data.order_id as string | undefined, status: "PENDING", message: "PERPAY_QUERY_FAILED" };
        const payment = data.payment as Record<string, unknown> | undefined;
        const status = payment?.status === "CONFIRMED" ? "PAID" : payment?.status === "DISPUTED" ? "FAILED" : "PENDING";
        if (status === "PAID" && amounts.received === null) return { provider: "PERPAY", verified: false, orderNo: input.orderNo, paymentOrderNo: data.order_id as string | undefined, status: "PENDING", message: "PERPAY_QUERY_FAILED" };
        return { provider: "PERPAY", verified: true, orderNo: input.orderNo, paymentOrderNo: data.order_id as string | undefined, amount: amounts.requested, currency: data.currency as string | undefined, status, message: "PERPAY_QUERY" };
      } catch { return { provider: "PERPAY", verified: false, orderNo: input.orderNo, paymentOrderNo: input.paymentOrderNo, status: "PENDING", message: "PERPAY_QUERY_FAILED" }; }
    },
  };
}
