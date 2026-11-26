import { createHash } from "node:crypto";
import { parseBepusdtConfig, parseEpayConfig, parseHashpayConfig, parseStripeConfig, parsePerpayConfig } from "@/lib/config-schemas";
import { amountToMinor, isCurrencyCode, minorToAmount } from "@/lib/money";
import { createPerpayAdapter } from "./perpay";
import { createEpayAdapter } from "./epay";
import { createAlipayPayment, queryAlipayPayment, verifyAlipayCallback } from "./alipay";
import type { PaymentAdapter, PaymentNotifyResult } from "./types";
import type { PaymentChannel, PaymentProviderKind } from "./registry";

function md5(value: string) { return createHash("md5").update(value).digest("hex"); }
function sign(values: Record<string, string>, key: string) { return md5(Object.entries(values).filter(([, value]) => value !== "").sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join("&") + key); }
function amount(value: string | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined; }
function stripeMinorUnit(value: number) { return value; }
// Stripe (and the Cloudflare edge in front of it) may answer with a plain-text error
// page such as "error code: 525", which must not surface as a JSON SyntaxError.
async function readStripeObject(response: Response) {
  try {
    const value = JSON.parse(await response.text()) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function stripeErrorDetail(body: Record<string, unknown> | null) {
  const code = (body?.error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? `_${code.toUpperCase()}` : "";
}
function base64Bytes(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
function base64(value: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(value))); }
function timingSafeStringEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index]! ^ rightBytes[index]!;
  return difference === 0;
}
function normalizedPem(value: string) {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (/-----BEGIN PUBLIC KEY-----/.test(normalized)) throw new Error("HASHPAY_PRIVATE_KEY_PUBLIC_KEY");
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(normalized)) throw new Error("HASHPAY_PRIVATE_KEY_PKCS1");
  return normalized;
}
async function importPem(value: string, algorithm: RsaHashedImportParams, usage: KeyUsage) {
  const body = normalizedPem(value).replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  return crypto.subtle.importKey("pkcs8", base64Bytes(body), algorithm, false, [usage]);
}

async function verifyStripeSignature(rawBody: string, signature: string, secret: string) {
  const parts = signature.split(",").map((part) => part.split("=", 2)).filter(([key, value]) => key && value);
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  const expectedHex = Array.from(base64Bytes(expected)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((candidate) => timingSafeStringEqual(candidate.toLowerCase(), expectedHex));
}

async function decryptHashpay(rawBody: string, privateKeyPem: string) {
  const envelope = JSON.parse(rawBody) as { key?: unknown; iv?: unknown; data?: unknown };
  if (typeof envelope.key !== "string" || !envelope.key || typeof envelope.iv !== "string" || !envelope.iv || typeof envelope.data !== "string" || !envelope.data) throw new Error("HASHPAY_CALLBACK_INVALID");
  const privateKey = await importPem(privateKeyPem, { name: "RSA-OAEP", hash: "SHA-256" }, "decrypt");
  const aesRaw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64Bytes(envelope.key));
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64Bytes(envelope.iv) }, aesKey, base64Bytes(envelope.data));
  const decrypted = JSON.parse(new TextDecoder().decode(plaintext)) as { timestamp?: unknown; payload?: unknown };
  if (!Number.isInteger(decrypted.timestamp) || !decrypted.payload || typeof decrypted.payload !== "object" || Array.isArray(decrypted.payload)) throw new Error("HASHPAY_CALLBACK_INVALID");
  return { timestamp: decrypted.timestamp as number, payload: decrypted.payload as Record<string, unknown> };
}

type HashpayOrderQuery = {
  id?: unknown;
  merchantId?: unknown;
  merchantNo?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
};

// HashPay order ids and merchant order numbers are short; cap them so a forged
// callback cannot turn the signed query into an oversized URL or DB lookup.
const HASHPAY_IDENTIFIER_MAX_LENGTH = 128;

// HashPay callbacks carry no signature: anyone holding the merchant public key can build a
// decryptable envelope. Source authentication therefore comes from this RSA-signed query:
// HashPay verifies it with the merchant public key and only returns that merchant's orders.
async function queryHashpayOrder(parsed: { baseUrl: string; merchantId: string; privateKey: string }, orderId: string): Promise<HashpayOrderQuery | null> {
  const privateKey = await importPem(parsed.privateKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, "sign");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const url = new URL(`${parsed.baseUrl.replace(/\/+$/, "")}/api/order/${encodeURIComponent(orderId)}`);
  const path = `${url.pathname}${url.search}`;
  const signature = base64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`GET\n${path}\n${timestamp}\n`)));
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-Merchant-Id": parsed.merchantId, "X-Timestamp": timestamp, "X-Signature": signature },
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    if (!response.ok) return null;
    const value = JSON.parse(await response.text()) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as HashpayOrderQuery : null;
  } catch {
    return null;
  }
}

function result(provider: PaymentProviderKind, values: Partial<PaymentNotifyResult> & Pick<PaymentNotifyResult, "verified" | "status" | "message">): PaymentNotifyResult {
  return { provider, ...values };
}

export function createProviderAdapter(provider: PaymentProviderKind, config: Record<string, unknown>): PaymentAdapter {
  const json = JSON.stringify(config);
  if (provider === "ALIPAY") return {
    create: async (input) => { const payment = await createAlipayPayment({ configJson: JSON.stringify({ ...config, notifyUrl: input.notifyUrl }), orderNo: input.orderNo, amount: input.amount, subject: input.subject, returnUrl: input.returnUrl, paymentChannel: input.channel }); return payment.mode === "web" ? { mode: "redirect", url: payment.redirectUrl, paymentOrderNo: payment.paymentOrderNo } : { mode: "qr", qrCode: payment.qrCode, paymentOrderNo: payment.paymentOrderNo }; },
    verify: async ({ payload }) => result(provider, { verified: await verifyAlipayCallback(json, payload), orderNo: payload.out_trade_no, paymentOrderNo: payload.trade_no, amount: amount(payload.total_amount), status: payload.trade_status === "TRADE_SUCCESS" || payload.trade_status === "TRADE_FINISHED" ? "PAID" : "FAILED", message: "ALIPAY_CALLBACK" }),
    query: async ({ orderNo, amount }) => queryAlipayPayment(json, orderNo, amount),
  };
  if (provider === "EPAY") return createEpayAdapter(parseEpayConfig(json));
  if (provider === "BEPUSDT") {
    const parsed = parseBepusdtConfig(json);
    return {
      create: async (input) => { const values = { order_id: input.orderNo, amount: Number((input.amount / 100).toFixed(2)), notify_url: input.notifyUrl, redirect_url: input.returnUrl, name: input.subject }; const response = await fetch(`${parsed.baseUrl.replace(/\/+$/, "")}/api/v1/order/create-order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, signature: md5(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&") + parsed.appSecret) }) }); let body: { status_code?: number; data?: { payment_url?: string; trade_id?: string } }; try { body = JSON.parse((await response.text()).replace(/^\uFEFF/, "")) as typeof body; } catch { throw new Error("BEPUSDT_INVALID_RESPONSE"); } if (!response.ok || body.status_code !== 200 || !body.data?.payment_url || !body.data.trade_id) throw new Error("BEPUSDT_CREATE_FAILED"); return { mode: "redirect", url: body.data.payment_url, paymentOrderNo: body.data.trade_id }; },
      verify: async ({ payload }) => { const values = { ...payload }; delete values.signature; delete values.__raw_body; return result(provider, { verified: timingSafeStringEqual(payload.signature ?? "", sign(values, parsed.appSecret)), orderNo: payload.order_id, paymentOrderNo: payload.trade_id, amount: amount(payload.amount), status: payload.status === "2" ? "PAID" : payload.status === "3" ? "FAILED" : "PENDING", message: "BEPUSDT_CALLBACK" }); },
    };
  }
  if (provider === "STRIPE") {
    const parsed = parseStripeConfig(json);
    return {
      create: async (input) => { const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${parsed.secretKey}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ "line_items[0][price_data][currency]": parsed.currency, "line_items[0][price_data][product_data][name]": input.subject, "line_items[0][price_data][unit_amount]": String(input.amount), "line_items[0][quantity]": "1", mode: "payment", success_url: input.returnUrl, cancel_url: input.returnUrl, "metadata[orderNo]": input.orderNo, "payment_intent_data[metadata][orderNo]": input.orderNo }).toString() }); const body = await readStripeObject(response); if (!response.ok) throw new Error(`STRIPE_CREATE_HTTP_${response.status}${stripeErrorDetail(body)}`); const url = body?.url; const id = body?.id; if (typeof url !== "string" || !url || typeof id !== "string" || !id) throw new Error("STRIPE_CREATE_FAILED"); return { mode: "redirect", url, paymentOrderNo: id }; },
      verify: async ({ rawBody = "", headers }) => {
        let event: { type?: string; data?: { object?: { id?: string; metadata?: { orderNo?: string }; amount_total?: number; currency?: string; payment_status?: string } } };
        try { event = JSON.parse(rawBody); } catch { return result(provider, { verified: false, status: "FAILED", message: "STRIPE_INVALID_JSON" }); }
        const object = event?.data?.object;
        if (typeof event?.type !== "string" || !event.type.trim() || !object || typeof object !== "object" || Array.isArray(object)) {
          return result(provider, { verified: false, status: "FAILED", message: "STRIPE_INVALID_EVENT" });
        }
        const verified = await verifyStripeSignature(rawBody, headers?.get("Stripe-Signature") ?? "", parsed.webhookSecret);
        if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
          return result(provider, { verified, status: "PENDING", message: "STRIPE_EVENT_IGNORED" });
        }
        // Delayed payment methods complete Checkout before the payment succeeds.
        const pending = event.type === "checkout.session.completed" && object.payment_status === "unpaid";
        return result(provider, {
          verified,
          orderNo: object.metadata?.orderNo,
          paymentOrderNo: object.id,
          amount: object.amount_total === undefined ? undefined : stripeMinorUnit(object.amount_total),
          currency: object.currency,
          status: object.payment_status === "paid" ? "PAID" : "PENDING",
          message: pending ? "STRIPE_PAYMENT_PENDING" : "STRIPE_CALLBACK",
        });
      },
      query: async ({ orderNo, paymentOrderNo }) => {
        if (!paymentOrderNo) return result(provider, { verified: false, orderNo, status: "PENDING", message: "STRIPE_ORDER_ID_MISSING" });
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(paymentOrderNo)}`, { headers: { Authorization: `Bearer ${parsed.secretKey}` } });
        const body = await readStripeObject(response);
        const metadata = body?.metadata as { orderNo?: unknown } | undefined;
        if (!response.ok || metadata?.orderNo !== orderNo) return result(provider, { verified: false, orderNo, paymentOrderNo, status: "PENDING", message: "STRIPE_QUERY_FAILED" });
        return result(provider, { verified: true, orderNo, paymentOrderNo: typeof body?.id === "string" ? body.id : undefined, amount: typeof body?.amount_total === "number" ? stripeMinorUnit(body.amount_total) : undefined, currency: typeof body?.currency === "string" ? body.currency : undefined, status: body?.payment_status === "paid" ? "PAID" : "PENDING", message: "STRIPE_QUERY" });
      },
    };
  }
  if (provider === "PERPAY") return createPerpayAdapter(parsePerpayConfig(json));
  const parsed = parseHashpayConfig(json);
  const hashpayCurrency = isCurrencyCode(parsed.currency) ? parsed.currency : "CNY";
  return {
    create: async (input) => { const privateKey = await importPem(parsed.privateKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, "sign"); const path = "/api/merchant/new"; const timestamp = Math.floor(Date.now() / 1000).toString(); const body = JSON.stringify({ merchantNo: input.orderNo, amount: minorToAmount(input.amount, hashpayCurrency), currency: parsed.currency, description: input.subject, return_url: input.returnUrl }); const signature = base64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`POST\n${path}\n${timestamp}\n${body}`))); const response = await fetch(`${parsed.baseUrl.replace(/\/+$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json", "X-Merchant-Id": parsed.merchantId, "X-Timestamp": timestamp, "X-Signature": signature }, body, signal: AbortSignal.timeout(10_000), redirect: "manual" }); const text = await response.text(); let data: { checkoutUrl?: string; order?: { id?: string } }; try { data = JSON.parse(text); } catch { throw new Error("HASHPAY_INVALID_RESPONSE"); } if (!response.ok || !data.checkoutUrl || !data.order?.id) throw new Error("HASHPAY_CREATE_FAILED"); return { mode: "redirect", url: data.checkoutUrl, paymentOrderNo: data.order.id }; },
    verify: async ({ rawBody = "" }) => {
      try {
        const decrypted = await decryptHashpay(rawBody, parsed.privateKey);
        if (Math.abs(Date.now() / 1000 - decrypted.timestamp) > 300) {
          return result(provider, { verified: false, status: "FAILED", message: "HASHPAY_TIMESTAMP_EXPIRED" });
        }
        const payload = decrypted.payload;
        const merchantNo = typeof payload.merchantNo === "string" ? payload.merchantNo.trim() : "";
        const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
        const claimedAmount = Number(payload.amount);
        if (!merchantNo || merchantNo.length > HASHPAY_IDENTIFIER_MAX_LENGTH || !orderId || orderId.length > HASHPAY_IDENTIFIER_MAX_LENGTH || !Number.isFinite(claimedAmount) || claimedAmount <= 0) {
          throw new Error("HASHPAY_CALLBACK_INVALID");
        }
        // The callback's own status/amount are attacker-controlled once the public key leaks.
        // Confirm against the signed order query and never trust the envelope contents alone.
        const order = await queryHashpayOrder(parsed, orderId);
        if (!order) {
          return result(provider, { verified: false, status: "PENDING", message: "HASHPAY_QUERY_FAILED" });
        }
        const queryMerchantId = typeof order.merchantId === "string" ? order.merchantId : "";
        const queryMerchantNo = typeof order.merchantNo === "string" ? order.merchantNo : "";
        const queryAmount = Number(order.amount);
        const queryCurrency = typeof order.currency === "string" ? order.currency.toUpperCase() : undefined;
        const verified =
          order.status === "paid"
          && order.id === orderId
          && queryMerchantId === parsed.merchantId
          && queryMerchantNo === merchantNo
          && Number.isFinite(queryAmount)
          && amountToMinor(queryAmount, hashpayCurrency) === amountToMinor(claimedAmount, hashpayCurrency)
          && (!queryCurrency || queryCurrency === hashpayCurrency.toUpperCase());
        return result(provider, {
          verified,
          orderNo: merchantNo,
          paymentOrderNo: orderId,
          amount: Number.isFinite(queryAmount) ? amountToMinor(queryAmount, hashpayCurrency) : undefined,
          currency: queryCurrency,
          status: verified ? "PAID" : order.status === "expired" || order.status === "invalid" ? "FAILED" : "PENDING",
          message: verified ? "HASHPAY_QUERY_VERIFIED" : "HASHPAY_QUERY_MISMATCH",
        });
      } catch {
        return result(provider, { verified: false, status: "FAILED", message: "HASHPAY_CALLBACK_INVALID" });
      }
    },
  };
}

export type { PaymentChannel };
