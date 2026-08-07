import { getWorkerSecret, parseAlipayConfig, type AlipayConfig } from "@/lib/config-schemas";
import { canonicalizeAlipayParameters } from "@/lib/payment-utils";

const ALIPAY_GATEWAY = "https://openapi.alipay.com/gateway.do";

export class AlipayError extends Error {}

type RuntimeSecrets = Record<string, unknown>;

function textEncoder(value: string) {
  return new TextEncoder().encode(value);
}



function fromBase64(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pemBody(value: string, label: string) {
  const match = value.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`));
  if (!match) throw new AlipayError(`ALIPAY_${label.replaceAll(" ", "_")}_REQUIRED`);
  return fromBase64(match[1]);
}

async function importPrivateKey(config: AlipayConfig, secrets: RuntimeSecrets) {
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      pemBody(getWorkerSecret(secrets, config.privateKey), "PRIVATE KEY"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error instanceof AlipayError) throw error;
    throw new AlipayError("ALIPAY_PRIVATE_KEY_INVALID");
  }
}

async function importPublicKey(config: AlipayConfig, secrets: RuntimeSecrets) {
  try {
    return await crypto.subtle.importKey(
      "spki",
      pemBody(getWorkerSecret(secrets, config.alipayPublicKey), "PUBLIC KEY"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch (error) {
    if (error instanceof AlipayError) throw error;
    throw new AlipayError("ALIPAY_PUBLIC_KEY_INVALID");
  }
}

async function sign(parameters: Record<string, string>, config: AlipayConfig, secrets: RuntimeSecrets) {
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importPrivateKey(config, secrets), textEncoder(canonicalizeAlipayParameters(parameters)));
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
  secrets: RuntimeSecrets;
  orderNo: string;
  queryToken: string;
  amount: number;
  subject: string;
}) {
  const config = parseAlipayConfig(input.configJson);
  if (!config.notifyUrl?.trim()) throw new AlipayError("ALIPAY_NOTIFY_URL_REQUIRED");

  const method = config.mode === "web" ? "alipay.trade.page.pay" : "alipay.trade.precreate";
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
      product_code: config.mode === "web" ? "FAST_INSTANT_TRADE_PAY" : undefined,
    }),
  };
  if (config.mode === "web" && config.returnUrl?.trim()) {
    const returnUrl = new URL(config.returnUrl);
    returnUrl.searchParams.set("orderNo", input.orderNo);
    returnUrl.searchParams.set("queryToken", input.queryToken);
    parameters.return_url = returnUrl.toString();
  }
  parameters.sign = await sign(parameters, config, input.secrets);

  if (config.mode === "web") {
    const redirectUrl = `${ALIPAY_GATEWAY}?${new URLSearchParams(parameters).toString()}`;
    return { mode: "web" as const, redirectUrl, paymentOrderNo: input.orderNo };
  }

  const response = await fetch(ALIPAY_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const body = await response.json() as Record<string, unknown>;
  const result = body.alipay_trade_precreate_response as { code?: string; msg?: string; out_trade_no?: string; qr_code?: string } | undefined;
  if (!response.ok || result?.code !== "10000" || !result.qr_code || !result.out_trade_no) {
    throw new AlipayError(`ALIPAY_PRECREATE_FAILED:${result?.code ?? response.status}`);
  }
  return { mode: "face_to_face" as const, qrCode: result.qr_code, paymentOrderNo: result.out_trade_no };
}

export async function verifyAlipayCallback(configJson: string, secrets: RuntimeSecrets, parameters: Record<string, string>) {
  const config = parseAlipayConfig(configJson);
  const signature = parameters.sign;
  if (!signature || parameters.sign_type !== "RSA2") return false;
  try {
    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await importPublicKey(config, secrets),
      fromBase64(signature),
      textEncoder(canonicalizeAlipayParameters(parameters, true)),
    );
  } catch {
    return false;
  }
}
