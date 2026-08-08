import assert from "node:assert/strict";
import test from "node:test";
import { getProviderDefinition, parseProviderConfig, validateProviderRegistry } from "../server/payment/registry.ts";

const validConfigs = {
  ALIPAY: { schemaVersion: 1, modes: ["web", "face_to_face"], baseUrl: "https://openapi.alipay.com", appId: "app-id", privateKey: "private", alipayPublicKey: "public", notifyUrl: "https://shop.example/payments/alipay", returnUrl: "https://shop.example/payment-result" },
  EPAY: { schemaVersion: 1, baseUrl: "https://epay.example", pid: "1000", key: "secret", epayChannels: ["alipay", "wxpay"], notifyUrl: "https://shop.example/payments/epay", returnUrl: "https://shop.example/payment-result" },
  BEPUSDT: { schemaVersion: 1, baseUrl: "https://bepusdt.example", appSecret: "secret", notifyUrl: "https://shop.example/payments/bepusdt", returnUrl: "https://shop.example/payment-result" },
  STRIPE: { schemaVersion: 1, secretKey: "sk_test", webhookSecret: "whsec_test", currency: "usd", returnUrl: "https://shop.example/payment-result" },
  HASHPAY: { schemaVersion: 1, baseUrl: "https://hashpay.example", merchantId: "merchant", privateKey: "private", currency: "CNY", returnUrl: "https://shop.example/payment-result" },
} as const;

test("payment provider registry is complete and unique", () => {
  assert.equal(validateProviderRegistry(), true);
  for (const provider of Object.keys(validConfigs)) assert.ok(getProviderDefinition(provider));
  assert.equal(getProviderDefinition("UNKNOWN"), undefined);
});

test("payment provider configs accept each supported provider", () => {
  for (const [provider, config] of Object.entries(validConfigs)) {
    const parsed = parseProviderConfig(provider, JSON.stringify(config));
    assert.equal(parsed.schemaVersion, 1);
  }
});

test("payment provider configs reject unknown fields, invalid types, and invalid channels", () => {
  assert.throws(() => parseProviderConfig("STRIPE", JSON.stringify({ ...validConfigs.STRIPE, unknownField: "no" })), /PAYMENT_CONFIG_INVALID/);
  assert.throws(() => parseProviderConfig("STRIPE", JSON.stringify({ ...validConfigs.STRIPE, currency: 123 })), /currency must be a non-empty string/);
  assert.throws(() => parseProviderConfig("EPAY", JSON.stringify({ ...validConfigs.EPAY, epayChannels: ["invalid"] })), /unsupported value/);
  assert.throws(() => parseProviderConfig("ALIPAY", JSON.stringify({ ...validConfigs.ALIPAY, modes: [] })), /unsupported value/);
});
