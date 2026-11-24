import { createHash } from "node:crypto";
import type { EpayConfig } from "@/lib/config-schemas";
import type { PaymentAdapter, PaymentNotifyResult, PaymentQueryResult, PaymentResult } from "./types";

type Values = Record<string, string>;

const encoder = new TextEncoder();

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

// Keep V1's original ordering and empty-value rules independent of V2.
function legacySign(values: Values, key: string) {
  return md5(Object.entries(values).filter(([, value]) => value !== "").sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join("&") + key);
}

/**
 * V2 uses PHP `ksort`, skipping whitespace-only values and signature fields.
 * Only the callback normalizer's raw-body helper is excluded; extension fields
 * participate with their original, untrimmed values.
 */
function canonical(values: Values) {
  return Object.keys(values)
    .filter((key) => key !== "sign" && key !== "sign_type" && key !== "__raw_body")
    .filter((key) => {
      const value = values[key];
      return typeof value === "string" && value.trim() !== "";
    })
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join("&");
}

function scalarValues(value: Record<string, unknown>) {
  const values: Values = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") values[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) values[key] = String(item);
  }
  return values;
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index]! ^ rightBytes[index]!;
  return difference === 0;
}

function amount(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function base64Bytes(value: string) {
  const normalized = value.replace(/\s+/g, "");
  try {
    return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("EPAY_KEY_INVALID");
  }
}

function base64(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

function keyBytes(value: string) {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (/-----BEGIN RSA PRIVATE KEY-----|-----BEGIN RSA PUBLIC KEY-----/.test(normalized)) throw new Error("EPAY_KEY_PKCS1_UNSUPPORTED");
  const body = normalized.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("EPAY_KEY_INVALID");
  return base64Bytes(body);
}

const rsa = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

async function rsaSign(text: string, privateKey: string) {
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", keyBytes(privateKey), rsa, false, ["sign"]);
  } catch {
    throw new Error("EPAY_PRIVATE_KEY_INVALID");
  }
  return base64(await crypto.subtle.sign(rsa, key, encoder.encode(text)));
}

async function rsaVerify(text: string, signature: string, publicKey: string) {
  if (!signature) return false;
  try {
    const key = await crypto.subtle.importKey("spki", keyBytes(publicKey), rsa, false, ["verify"]);
    return await crypto.subtle.verify(rsa, key, base64Bytes(signature), encoder.encode(text));
  } catch {
    return false;
  }
}

async function readObject(response: Response) {
  const text = await response.text();
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isSuccessCode(code: unknown) {
  return code === 0 || code === "0";
}

function codeDetail(code: unknown) {
  if (typeof code === "number" && Number.isInteger(code)) return String(code);
  if (typeof code === "string" && /^-?\d{1,6}$/.test(code)) return code;
  return "UNKNOWN";
}

function createFailure(prefix: string, code: unknown) {
  // -3 is signature rejection, -4 missing parameters: both point at the merchant
  // configuration, so keep them distinguishable from generic channel failures.
  if (code === -3 || code === "-3") return `${prefix}_SIGNATURE_REJECTED`;
  if (code === -4 || code === "-4") return `${prefix}_PARAMS_REJECTED`;
  return `${prefix}_CODE_${codeDetail(code)}`;
}

function endpoint(config: EpayConfig, path: string) {
  return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

function result(provider: "EPAY", values: Omit<PaymentNotifyResult, "provider">): PaymentNotifyResult {
  return { provider, ...values };
}

function legacyCreate(config: EpayConfig, input: { orderNo: string; amount: number; subject: string; notifyUrl: string; returnUrl: string; channel?: string }): PaymentResult {
  const values = { pid: config.pid, type: input.channel === "wxpay" ? "wxpay" : "alipay", out_trade_no: input.orderNo, notify_url: input.notifyUrl, return_url: input.returnUrl, name: input.subject, money: (input.amount / 100).toFixed(2) };
  const signature = legacySign(values, config.key);
  return { mode: "redirect", url: `${endpoint(config, "/submit.php")}?${new URLSearchParams({ ...values, sign: signature, sign_type: "MD5" })}`, paymentOrderNo: input.orderNo };
}

async function createRsa(config: EpayConfig, input: { orderNo: string; amount: number; subject: string; notifyUrl: string; returnUrl: string; channel?: string; clientIp?: string }) {
  const clientIp = input.clientIp?.trim();
  if (!clientIp) throw new Error("EPAY_CLIENT_IP_REQUIRED");
  const values: Values = {
    pid: config.pid,
    method: "jump",
    type: input.channel === "wxpay" ? "wxpay" : "alipay",
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.subject,
    money: (input.amount / 100).toFixed(2),
    clientip: clientIp,
    timestamp: String(Math.floor(Date.now() / 1000)),
    sign_type: "RSA",
  };
  values.sign = await rsaSign(canonical(values), config.merchantPrivateKey);
  const response = await fetch(endpoint(config, "/api/pay/create"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values).toString(),
  });
  const body = await readObject(response);
  if (!response.ok) throw new Error(`EPAY_CREATE_HTTP_${response.status}`);
  if (!body) throw new Error("EPAY_CREATE_INVALID_RESPONSE");
  if (!isSuccessCode(body.code)) throw new Error(createFailure("EPAY_CREATE", body.code));
  if (!await rsaVerify(canonical(scalarValues(body)), typeof body.sign === "string" ? body.sign : "", config.platformPublicKey)) throw new Error("EPAY_RESPONSE_SIGNATURE_INVALID");
  if (body.pay_type !== "jump" || typeof body.pay_info !== "string" || !body.pay_info) throw new Error("EPAY_CREATE_FAILED");
  let url: URL;
  try { url = new URL(body.pay_info); } catch { throw new Error("EPAY_CREATE_FAILED"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("EPAY_CREATE_FAILED");
  if (typeof body.trade_no !== "string" || !body.trade_no.trim()) throw new Error("EPAY_CREATE_INVALID_RESPONSE");
    const paymentOrderNo = body.trade_no;
  return { mode: "redirect", url: url.toString(), paymentOrderNo } satisfies PaymentResult;
}

async function verifyNotification(config: EpayConfig, payload: Values): Promise<PaymentNotifyResult> {
  const orderNo = payload.out_trade_no;
  const paymentOrderNo = payload.trade_no;
  if (!timingSafeStringEqual(payload.pid ?? "", config.pid)) return result("EPAY", { verified: false, orderNo, paymentOrderNo, status: "FAILED", message: "EPAY_CALLBACK_PID_MISMATCH" });
  const signType = (payload.sign_type || "MD5").toUpperCase();
  if (signType !== config.signType) return result("EPAY", { verified: false, orderNo, paymentOrderNo, status: "FAILED", message: "EPAY_CALLBACK_VERIFY_FAILED" });
  const signature = payload.sign ?? "";
  const values = { ...payload };
  delete values.sign;
  delete values.sign_type;
  const verified = config.signType === "RSA"
    ? await rsaVerify(canonical(values), signature, config.platformPublicKey)
    : Boolean(config.key) && timingSafeStringEqual(signature, legacySign(values, config.key));
  if (!verified) return result("EPAY", { verified: false, orderNo, paymentOrderNo, status: "FAILED", message: "EPAY_CALLBACK_VERIFY_FAILED" });
  const tradeStatus = config.signType === "RSA"
    ? payload.trade_status || ""
    : payload.trade_status || payload.status || "";
  const status = config.signType === "RSA"
    ? tradeStatus === "TRADE_SUCCESS" ? "PAID" : tradeStatus ? "FAILED" : "PENDING"
    : tradeStatus === "TRADE_SUCCESS" || tradeStatus === "success" ? "PAID" : tradeStatus ? "FAILED" : "PENDING";
  return result("EPAY", { verified: true, orderNo, paymentOrderNo, amount: amount(payload.money), status, message: "EPAY_CALLBACK" });
}

function queryFailure(orderNo: string, paymentOrderNo: string | undefined, message: string): PaymentQueryResult {
  return { provider: "EPAY", verified: false, orderNo, paymentOrderNo, status: "PENDING", message };
}

async function queryOrder(config: EpayConfig, input: { orderNo: string; paymentOrderNo?: string; amount: number }): Promise<PaymentQueryResult> {
  try {
    // Querying by the signed merchant order number keeps ownership verification
    // on our side and works even when the attempt lacks a platform trade number.
    const values: Values = { pid: config.pid, out_trade_no: input.orderNo, timestamp: String(Math.floor(Date.now() / 1000)), sign_type: "RSA" };
    values.sign = await rsaSign(canonical(values), config.merchantPrivateKey);
    const response = await fetch(endpoint(config, "/api/pay/query"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values).toString(),
    });
    const body = await readObject(response);
    if (!response.ok || !body) return queryFailure(input.orderNo, input.paymentOrderNo, "EPAY_QUERY_FAILED");
    if (!await rsaVerify(canonical(scalarValues(body)), typeof body.sign === "string" ? body.sign : "", config.platformPublicKey)) return queryFailure(input.orderNo, input.paymentOrderNo, "EPAY_QUERY_FAILED");
    if (!isSuccessCode(body.code) || body.out_trade_no !== input.orderNo) return queryFailure(input.orderNo, input.paymentOrderNo, "EPAY_QUERY_FAILED");
    const tradeNo = typeof body.trade_no === "string" && body.trade_no ? body.trade_no : input.paymentOrderNo;
    return {
      provider: "EPAY",
      verified: true,
      orderNo: input.orderNo,
      paymentOrderNo: tradeNo,
      amount: amount(typeof body.money === "number" ? String(body.money) : typeof body.money === "string" ? body.money : undefined),
      status: body.status === 1 || body.status === "1" ? "PAID" : "PENDING",
      message: "EPAY_QUERY",
    };
  } catch {
    return queryFailure(input.orderNo, input.paymentOrderNo, "EPAY_QUERY_FAILED");
  }
}

export function createEpayAdapter(config: EpayConfig): PaymentAdapter {
  if (config.signType === "RSA") {
    return {
      create: (input) => createRsa(config, input),
      verify: ({ payload }) => verifyNotification(config, payload),
      query: (input) => queryOrder(config, input),
    };
  }
  return {
    create: async (input) => legacyCreate(config, input),
    verify: ({ payload }) => verifyNotification(config, payload),
  };
}
