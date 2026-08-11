import { parseAlipayConfig, type AlipayConfig } from "@/lib/config-schemas";
import { canonicalizeAlipayParameters } from "@/lib/payment-utils";


export class AlipayError extends Error {}

function textEncoder(value: string) {
  return new TextEncoder().encode(value);
}



function fromBase64(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function keyBytes(value: string, label: string) {
  const expectedLabel = label.replaceAll(" ", "_");
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (!normalized) throw new AlipayError(`ALIPAY_${expectedLabel}_REQUIRED`);

  const pem = normalized.match(new RegExp(`^-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----$`));
  try {
    return fromBase64(pem ? pem[1] : normalized);
  } catch {
    throw new AlipayError(`ALIPAY_${expectedLabel}_INVALID`);
  }
}

function alipayGateway(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/gateway.do") ? normalized : `${normalized}/gateway.do`;
}

async function importPrivateKey(config: AlipayConfig) {
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      keyBytes(config.privateKey, "PRIVATE KEY"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error instanceof AlipayError) throw error;
    throw new AlipayError("ALIPAY_PRIVATE_KEY_INVALID");
  }
}

async function importPublicKey(config: AlipayConfig) {
  try {
    return await crypto.subtle.importKey(
      "spki",
      keyBytes(config.alipayPublicKey, "PUBLIC KEY"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch (error) {
    if (error instanceof AlipayError) throw error;
    throw new AlipayError("ALIPAY_PUBLIC_KEY_INVALID");
  }
}

async function sign(parameters: Record<string, string>, config: AlipayConfig) {
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importPrivateKey(config), textEncoder(canonicalizeAlipayParameters(parameters)));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function formatTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium", hour12: false });
  return formatter.format(date).replace(" ", " ");
}

function amountToYuan(amount: number) {
  return (amount / 100).toFixed(2);
}

export async function createAlipayPayment(input: {
  configJson: string;
  orderNo: string;
  queryToken: string;
  amount: number;
  subject: string;
  paymentChannel?: string;
}) {
  const config = parseAlipayConfig(input.configJson);
  if (!config.notifyUrl?.trim()) throw new AlipayError("ALIPAY_NOTIFY_URL_REQUIRED");
  const gateway = alipayGateway(config.baseUrl);

  const channel = input.paymentChannel === "face_to_face" ? "face_to_face" : input.paymentChannel === "wap" ? "wap" : "web";
  const configuredMode = channel === "face_to_face" ? "face_to_face" : "web";
  if (!config.modes.includes(configuredMode)) throw new AlipayError("PAYMENT_CHANNEL_INVALID");
  const method = channel === "web" ? "alipay.trade.page.pay" : channel === "wap" ? "alipay.trade.wap.pay" : "alipay.trade.precreate";
  const parameters: Record<string, string> = {
    app_id: config.appId,
    method,
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatTimestamp(),
    version: "1.0",
    notify_url: config.notifyUrl,
    biz_content: JSON.stringify({
      out_trade_no: input.orderNo,
      total_amount: amountToYuan(input.amount),
      subject: input.subject.slice(0, 128),
      product_code: channel === "web" ? "FAST_INSTANT_TRADE_PAY" : channel === "wap" ? "QUICK_WAP_WAY" : "QR_CODE_OFFLINE",
    }),
  };
  if (channel !== "face_to_face" && config.returnUrl?.trim()) {
    const returnUrl = new URL(config.returnUrl);
    returnUrl.searchParams.set("orderNo", input.orderNo);
    returnUrl.searchParams.set("queryToken", input.queryToken);
    parameters.return_url = returnUrl.toString();
  }
  parameters.sign = await sign(parameters, config);

  if (channel !== "face_to_face") {
    const redirectUrl = `${gateway}?${new URLSearchParams(parameters).toString()}`;
    return { mode: "web" as const, redirectUrl, paymentOrderNo: input.orderNo };
  }

  const response = await fetch(`${gateway}?${new URLSearchParams(parameters).toString()}`);
  const body = await response.json() as Record<string, unknown>;
  const result = body.alipay_trade_precreate_response as { code?: string; msg?: string; out_trade_no?: string; qr_code?: string } | undefined;
  if (!response.ok || result?.code !== "10000" || !result.qr_code || !result.out_trade_no) {
    throw new AlipayError(`ALIPAY_PRECREATE_FAILED:${result?.code ?? response.status}`);
  }
  return { mode: "face_to_face" as const, qrCode: result.qr_code, paymentOrderNo: result.out_trade_no };
}

export async function queryAlipayPayment(configJson: string, orderNo: string, amount: number) {
  const config = parseAlipayConfig(configJson);
  const parameters: Record<string, string> = {
    app_id: config.appId,
    method: "alipay.trade.query",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatTimestamp(),
    version: "1.0",
    biz_content: JSON.stringify({ out_trade_no: orderNo }),
  };
  parameters.sign = await sign(parameters, config);
  const response = await fetch(alipayGateway(config.baseUrl), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters) });
  const body = await response.json() as Record<string, unknown>;
  const result = body.alipay_trade_query_response as { code?: string; out_trade_no?: string; trade_status?: string; trade_no?: string; total_amount?: string } | undefined;
  const verified = response.ok && result?.code === "10000" && result.out_trade_no === orderNo;
  const paid = verified && (result.trade_status === "TRADE_SUCCESS" || result.trade_status === "TRADE_FINISHED");
  return { provider: "ALIPAY" as const, verified, orderNo, paymentOrderNo: result?.trade_no ?? orderNo, amount: result?.total_amount ? Math.round(Number(result.total_amount) * 100) : amount, status: paid ? "PAID" as const : "PENDING" as const, message: verified ? "ALIPAY_QUERY" : "ALIPAY_QUERY_FAILED" };
}

export async function verifyAlipayCallback(configJson: string, parameters: Record<string, string>) {
  const config = parseAlipayConfig(configJson);
  const signature = parameters.sign;
  if (!signature || parameters.sign_type !== "RSA2" || parameters.app_id !== config.appId) return false;
  try {
    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await importPublicKey(config),
      fromBase64(signature),
      textEncoder(canonicalizeAlipayParameters(parameters, true)),
    );
  } catch {
    return false;
  }
}
