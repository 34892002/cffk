import { createProviderAdapter } from "./providers";
import type { PaymentAdapter } from "./types";
import { validateJsonFormValues, type JsonFormFieldDefinition, type JsonFormValues } from "@/lib/json-form-values";
import {
  parseAlipayConfig,
  parseBepusdtConfig,
  parseEpayConfig,
  parseHashpayConfig,
  parseStripeConfig,
  type PaymentProviderConfig,
} from "@/lib/config-schemas";

export type PaymentProviderKind = "ALIPAY" | "EPAY" | "BEPUSDT" | "STRIPE" | "HASHPAY";
export type PaymentChannel = "web" | "wap" | "face_to_face" | "alipay" | "wxpay";


export type ProviderDefinition = {
  provider: PaymentProviderKind;
  title: string;
  schemaVersion: 1;
  fields: JsonFormFieldDefinition[];
  defaults: JsonFormValues;
  parseConfig: (json: string) => PaymentProviderConfig;
  getChannels: (config: PaymentProviderConfig) => PaymentChannel[];
  createAdapter: (config: Record<string, unknown>) => PaymentAdapter;

  callbackResponse: "text";
};

const common = {
  notifyUrl: { key: "notifyUrl", label: "回调地址", type: "url" as const },
  returnUrl: { key: "returnUrl", label: "返回地址", type: "url" as const },
};

export const paymentProviderDefinitions: Record<PaymentProviderKind, ProviderDefinition> = {
  ALIPAY: {
    provider: "ALIPAY",
    title: "支付宝",
    schemaVersion: 1,
    fields: [
      { key: "modes", label: "支付模式", type: "multi_select", required: true, min: 1, options: [{ label: "网页/H5", value: "web" }, { label: "当面付", value: "face_to_face" }] },
      { key: "baseUrl", label: "网关地址", type: "url", required: true },
      { key: "appId", label: "应用 ID", type: "text", required: true },
      { key: "sellerId", label: "商户 PID / seller_id", type: "text", required: true },
      { key: "privateKey", label: "应用私钥", type: "textarea", required: true, secret: true },
      { key: "alipayPublicKey", label: "支付宝公钥", type: "textarea", required: true, secret: true },
      common.notifyUrl,
      common.returnUrl,
    ],
    defaults: { schemaVersion: 1, modes: ["web"], baseUrl: "https://openapi.alipay.com", appId: "", sellerId: "", notifyUrl: "", returnUrl: "" },
    parseConfig: parseAlipayConfig,
    getChannels: (config) => {
      if (config.schemaVersion !== 1 || !("modes" in config)) return [];
      return config.modes.map((mode) => mode === "web" ? "web" : "face_to_face");
    },
    createAdapter: (config) => createProviderAdapter("ALIPAY", config),

    callbackResponse: "text",
  },
  EPAY: {
    provider: "EPAY",
    title: "易支付",
    schemaVersion: 1,
    fields: [
      { key: "baseUrl", label: "网关地址", type: "url", required: true },
      { key: "pid", label: "商户 PID", type: "text", required: true },
      { key: "key", label: "商户密钥", type: "password", required: true, secret: true },
      { key: "epayChannels", label: "支付子渠道", type: "multi_select", required: true, min: 1, options: [{ label: "支付宝", value: "alipay" }, { label: "微信", value: "wxpay" }] },
      common.notifyUrl,
      common.returnUrl,
    ],
    defaults: { schemaVersion: 1, baseUrl: "", pid: "", epayChannels: ["alipay", "wxpay"], notifyUrl: "", returnUrl: "" },
    parseConfig: parseEpayConfig,
    getChannels: (config) => "epayChannels" in config ? config.epayChannels : [],
    createAdapter: (config) => createProviderAdapter("EPAY", config),
    callbackResponse: "text",
  },
  BEPUSDT: {
    provider: "BEPUSDT",
    title: "BEpusdt",
    schemaVersion: 1,
    fields: [{ key: "baseUrl", label: "网关地址", type: "url", required: true }, { key: "appSecret", label: "应用密钥", type: "password", required: true, secret: true }, common.notifyUrl, common.returnUrl],
    defaults: { schemaVersion: 1, baseUrl: "", appSecret: "", notifyUrl: "", returnUrl: "" },
    parseConfig: parseBepusdtConfig,
    getChannels: () => [],
    createAdapter: (config) => createProviderAdapter("BEPUSDT", config),
    callbackResponse: "text",
  },
  STRIPE: {
    provider: "STRIPE",
    title: "Stripe",
    schemaVersion: 1,
    fields: [{ key: "secretKey", label: "Secret Key", type: "password", required: true, secret: true }, { key: "webhookSecret", label: "Webhook Secret", type: "password", required: true, secret: true }, { key: "currency", label: "币种", type: "select", required: true, options: [{ label: "CNY", value: "cny" }, { label: "USD", value: "usd" }] }, common.notifyUrl, common.returnUrl],
    defaults: { schemaVersion: 1, secretKey: "", webhookSecret: "", currency: "cny", notifyUrl: "", returnUrl: "" },
    parseConfig: parseStripeConfig,
    getChannels: () => [],
    createAdapter: (config) => createProviderAdapter("STRIPE", config),
    callbackResponse: "text",
  },
  HASHPAY: {
    provider: "HASHPAY",
    title: "HashPay",
    schemaVersion: 1,
    fields: [{ key: "baseUrl", label: "网关地址", type: "url", required: true }, { key: "merchantId", label: "商户 ID", type: "text", required: true }, { key: "privateKey", label: "PKCS#8 私钥", type: "textarea", required: true, secret: true }, { key: "currency", label: "币种", type: "text", required: true }, common.notifyUrl, common.returnUrl],
    defaults: { schemaVersion: 1, baseUrl: "", merchantId: "", privateKey: "", currency: "CNY", notifyUrl: "", returnUrl: "" },
    parseConfig: parseHashpayConfig,
    getChannels: () => [],
    createAdapter: (config) => createProviderAdapter("HASHPAY", config),
    callbackResponse: "text",
  },
};

const paymentNotifyPaths: Partial<Record<PaymentProviderKind, string>> = {
  ALIPAY: "/api/payments/alipay/notify",
  EPAY: "/api/payments/epay/notify",
  BEPUSDT: "/api/payments/bepusdt/notify",
  STRIPE: "/api/payments/stripe/notify",
  HASHPAY: "/api/payments/hashpay/notify",
};

export function getProviderDefinition(provider: string) {
  return paymentProviderDefinitions[provider as PaymentProviderKind];
}

export function getPaymentUrlDefaults(provider: PaymentProviderKind, siteUrl: string | null | undefined) {
  if (!siteUrl) return { notifyUrl: "", returnUrl: "" };
  const origin = new URL(siteUrl).origin;
  return {
    notifyUrl: `${origin}${paymentNotifyPaths[provider] ?? ""}`,
    returnUrl: `${origin}/payment-result`,
  };
}

export function getPaymentNotifyPath(provider: PaymentProviderKind) {
  return paymentNotifyPaths[provider] ?? "";
}

export function parseProviderConfig(provider: string, configJson: string) {
  const definition = getProviderDefinition(provider);
  if (!definition) throw new Error("PAYMENT_PROVIDER_NOT_IMPLEMENTED");
  let value: unknown;
  try { value = JSON.parse(configJson); } catch { throw new Error("PAYMENT_CONFIG_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PAYMENT_CONFIG_INVALID");
  const allowed = new Set(["schemaVersion", ...definition.fields.map((field) => field.key)]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("PAYMENT_CONFIG_INVALID");
  validateJsonFormValues(definition.fields, value as Record<string, unknown>);
  return definition.parseConfig(configJson);
}

export function validateProviderRegistry() {
  const providers = Object.keys(paymentProviderDefinitions);
  if (new Set(providers).size !== providers.length) throw new Error("PAYMENT_PROVIDER_REGISTRY_DUPLICATE");
  for (const [provider, definition] of Object.entries(paymentProviderDefinitions)) {
    if (definition.provider !== provider || definition.schemaVersion !== 1 || definition.fields.some((field) => !field.key.trim())) throw new Error("PAYMENT_PROVIDER_REGISTRY_INVALID");
  }
  return true;
}

validateProviderRegistry();
