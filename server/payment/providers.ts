import { createHash } from "node:crypto";
import { parseBepusdtConfig, parseEpayConfig, parseHashpayConfig, parseStripeConfig } from "@/lib/config-schemas";
import { createAlipayPayment, queryAlipayPayment, verifyAlipayCallback } from "./alipay";
import type { PaymentAdapter, PaymentNotifyResult } from "./types";
import type { PaymentChannel, PaymentProviderKind } from "./registry";

function md5(value: string) { return createHash("md5").update(value).digest("hex"); }
function sign(values: Record<string, string>, key: string) { return md5(Object.entries(values).filter(([, value]) => value !== "").sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join("&") + key); }
const ZERO_DECIMAL_CURRENCIES = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
function amount(value: string | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined; }
function stripeMinorUnit(value: number, currency: string) { return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? Math.round(value * 100) : value; }
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

function result(provider: PaymentProviderKind, values: Partial<PaymentNotifyResult> & Pick<PaymentNotifyResult, "verified" | "status" | "message">): PaymentNotifyResult {
  return { provider, ...values };
}

export function createProviderAdapter(provider: PaymentProviderKind, config: Record<string, unknown>): PaymentAdapter {
  const json = JSON.stringify(config);
  if (provider === "ALIPAY") return {
    create: async (input) => { const payment = await createAlipayPayment({ configJson: json, orderNo: input.orderNo, queryToken: input.queryToken, amount: input.amount, subject: input.subject, paymentChannel: input.channel }); return payment.mode === "web" ? { mode: "redirect", url: payment.redirectUrl, paymentOrderNo: payment.paymentOrderNo } : { mode: "qr", qrCode: payment.qrCode, paymentOrderNo: payment.paymentOrderNo }; },
    verify: async ({ payload }) => result(provider, { verified: await verifyAlipayCallback(json, payload), orderNo: payload.out_trade_no, paymentOrderNo: payload.trade_no, amount: amount(payload.total_amount), status: payload.trade_status === "TRADE_SUCCESS" || payload.trade_status === "TRADE_FINISHED" ? "PAID" : "FAILED", message: "ALIPAY_CALLBACK" }),
    query: async ({ orderNo, amount }) => queryAlipayPayment(json, orderNo, amount),
  };
  if (provider === "EPAY") {
    const parsed = parseEpayConfig(json);
    return {
      create: async (input) => { const values = { pid: parsed.pid, type: input.channel === "wxpay" ? "wxpay" : "alipay", out_trade_no: input.orderNo, notify_url: input.notifyUrl, return_url: input.returnUrl, name: input.subject, money: (input.amount / 100).toFixed(2) }; return { mode: "redirect", url: `${parsed.baseUrl.replace(/\/+$/, "")}/submit.php?${new URLSearchParams({ ...values, sign: sign(values, parsed.key), sign_type: "MD5" })}`, paymentOrderNo: input.orderNo }; },
      verify: async ({ payload }) => { const values = { ...payload }; delete values.sign; delete values.sign_type; const tradeStatus = payload.trade_status || payload.status || ""; return result(provider, { verified: payload.pid === parsed.pid && timingSafeStringEqual(payload.sign ?? "", sign(values, parsed.key)), orderNo: payload.out_trade_no, paymentOrderNo: payload.trade_no, amount: amount(payload.money), status: tradeStatus === "TRADE_SUCCESS" || tradeStatus === "success" ? "PAID" : tradeStatus ? "FAILED" : "PENDING", message: "EPAY_CALLBACK" }); },
    };
  }
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
      create: async (input) => { const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${parsed.secretKey}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ "payment_method_types[]": "card", "line_items[0][price_data][currency]": parsed.currency, "line_items[0][price_data][product_data][name]": input.subject, "line_items[0][price_data][unit_amount]": String(ZERO_DECIMAL_CURRENCIES.has(parsed.currency) ? Math.round(input.amount / 100) : input.amount), "line_items[0][quantity]": "1", mode: "payment", success_url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}orderNo=${encodeURIComponent(input.orderNo)}&queryToken=${encodeURIComponent(input.queryToken)}`, cancel_url: input.returnUrl, "metadata[orderNo]": input.orderNo, "payment_intent_data[metadata][orderNo]": input.orderNo }).toString() }); const body = await response.json() as { id?: string; url?: string }; if (!response.ok || !body.url || !body.id) throw new Error("STRIPE_CREATE_FAILED"); return { mode: "redirect", url: body.url, paymentOrderNo: body.id }; },
      verify: async ({ rawBody = "", headers }) => { let event: { type?: string; data?: { object?: { id?: string; metadata?: { orderNo?: string }; amount_total?: number; currency?: string; payment_status?: string } } }; try { event = JSON.parse(rawBody); } catch { return result(provider, { verified: false, status: "FAILED", message: "STRIPE_INVALID_JSON" }); } const object = event.data?.object; const verified = await verifyStripeSignature(rawBody, headers?.get("Stripe-Signature") ?? "", parsed.webhookSecret); return result(provider, { verified, orderNo: object?.metadata?.orderNo, paymentOrderNo: object?.id, amount: object?.amount_total === undefined ? undefined : stripeMinorUnit(object.amount_total, parsed.currency), currency: object?.currency, status: event.type === "checkout.session.completed" && object?.payment_status === "paid" ? "PAID" : "PENDING", message: "STRIPE_CALLBACK" }); },
      query: async ({ orderNo, paymentOrderNo }) => {
        if (!paymentOrderNo) return result(provider, { verified: false, orderNo, status: "PENDING", message: "STRIPE_ORDER_ID_MISSING" });
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(paymentOrderNo)}`, { headers: { Authorization: `Bearer ${parsed.secretKey}` } });
        const body = await response.json() as { id?: string; metadata?: { orderNo?: string }; amount_total?: number; currency?: string; payment_status?: string };
        if (!response.ok || body.metadata?.orderNo !== orderNo) return result(provider, { verified: false, orderNo, paymentOrderNo, status: "PENDING", message: "STRIPE_QUERY_FAILED" });
        return result(provider, { verified: true, orderNo, paymentOrderNo: body.id, amount: body.amount_total === undefined ? undefined : stripeMinorUnit(body.amount_total, parsed.currency), currency: body.currency, status: body.payment_status === "paid" ? "PAID" : "PENDING", message: "STRIPE_QUERY" });
      },
    };
  }
  const parsed = parseHashpayConfig(json);
  return {
    create: async (input) => { const privateKey = await importPem(parsed.privateKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, "sign"); const path = "/api/merchant/new"; const timestamp = Math.floor(Date.now() / 1000).toString(); const body = JSON.stringify({ merchantNo: input.orderNo, amount: input.amount / 100, currency: parsed.currency, description: input.subject, return_url: input.returnUrl }); const signature = base64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`POST\n${path}\n${timestamp}\n${body}`))); const response = await fetch(`${parsed.baseUrl.replace(/\/+$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json", "X-Merchant-Id": parsed.merchantId, "X-Timestamp": timestamp, "X-Signature": signature }, body }); const text = await response.text(); let data: { checkoutUrl?: string; order?: { id?: string } }; try { data = JSON.parse(text); } catch { throw new Error("HASHPAY_INVALID_RESPONSE"); } if (!response.ok || !data.checkoutUrl || !data.order?.id) throw new Error("HASHPAY_CREATE_FAILED"); return { mode: "redirect", url: data.checkoutUrl, paymentOrderNo: data.order.id }; },
    verify: async ({ rawBody = "" }) => { try { const decrypted = await decryptHashpay(rawBody, parsed.privateKey); if (Math.abs(Date.now() / 1000 - decrypted.timestamp) > 300) return result(provider, { verified: false, status: "FAILED", message: "HASHPAY_TIMESTAMP_EXPIRED" }); const payload = decrypted.payload; const merchantNo = typeof payload.merchantNo === "string" ? payload.merchantNo.trim() : ""; const paymentAmount = Number(payload.amount); if (!merchantNo || !Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error("HASHPAY_CALLBACK_INVALID"); return result(provider, { verified: true, orderNo: merchantNo, paymentOrderNo: payload.orderId ? String(payload.orderId) : undefined, amount: Math.round(paymentAmount * 100), currency: typeof payload.currency === "string" ? payload.currency.toUpperCase() : undefined, status: payload.status === "paid" ? "PAID" : payload.status === "expired" ? "FAILED" : "PENDING", message: "HASHPAY_CALLBACK" }); } catch { return result(provider, { verified: false, status: "FAILED", message: "HASHPAY_CALLBACK_INVALID" }); } },
  };
}

export type { PaymentChannel };
