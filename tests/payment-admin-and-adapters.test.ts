import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { AppError } from "../lib/app-error.ts";
import { mergePaymentProviderConfig, mergePaymentUrls } from "../server/payment/admin.telefunc.ts";
import { createProviderAdapter } from "../server/payment/providers.ts";
import { normalizePaymentCallbackPayload } from "../server/payment/callback-payload.ts";
import { getPaymentUrlDefaults } from "../server/payment/registry.ts";

const testPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const epayConfig = {
  schemaVersion: 1,
  baseUrl: "https://epay.example",
  pid: "1000",
  key: "old-secret",
  epayChannels: ["alipay", "wxpay"],
  notifyUrl: "https://shop.example/payments/epay",
  returnUrl: "https://shop.example/payment-result",
};

function appErrorCode(operation: () => unknown) {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : null;
  }
}

test("payment URL defaults use the configured site origin and fixed provider paths", () => {
  assert.deepEqual(getPaymentUrlDefaults("EPAY", "https://shop.example.com/store/"), {
    notifyUrl: "https://shop.example.com/api/payments/epay/notify",
    returnUrl: "https://shop.example.com/payment-result",
  });
  assert.deepEqual(getPaymentUrlDefaults("HASHPAY", null), { notifyUrl: "", returnUrl: "" });
});

test("Stripe callback payloads retain nested JSON and the exact raw body", () => {
  const rawBody = '{"id":"evt_1","data":{"object":{"metadata":{"orderNo":"ORD-1"},"amount_total":1234}}}';
  assert.deepEqual(
    normalizePaymentCallbackPayload("POST", "https://shop.example/api/payments/stripe/notify", rawBody, "STRIPE"),
    { id: "evt_1", __raw_body: rawBody },
  );
});

test("payment callback payloads retain GET query data and raw JSON bodies", () => {
  assert.deepEqual(
    normalizePaymentCallbackPayload("GET", "https://shop.example/api/payments/epay/notify?out_trade_no=ORD-1&sign=signature", ""),
    { out_trade_no: "ORD-1", sign: "signature" },
  );
  assert.deepEqual(
    normalizePaymentCallbackPayload("POST", "https://shop.example/api/payments/stripe/notify", '{"id":"evt_1"}', "STRIPE"),
    { id: "evt_1", __raw_body: '{"id":"evt_1"}' },
  );
});

test("payment callback payloads reject ambiguous and oversized input", () => {
  assert.throws(
    () => normalizePaymentCallbackPayload("POST", "https://shop.example/api/payments/epay/notify", "order=ORD-1&order=ORD-2"),
    /PAYMENT_CALLBACK_PAYLOAD_INVALID/,
  );
  assert.throws(
    () => normalizePaymentCallbackPayload("POST", "https://shop.example/api/payments/stripe/notify", '{"data":{"nested":"value"}}'),
    /PAYMENT_CALLBACK_PAYLOAD_INVALID/,
  );
  assert.throws(
    () => normalizePaymentCallbackPayload("POST", "https://shop.example/api/payments/stripe/notify", "x".repeat(64 * 1024 + 1)),
    /PAYMENT_CALLBACK_PAYLOAD_INVALID/,
  );
});

test("payment URL validation identifies the invalid field", () => {
  assert.equal(appErrorCode(() => mergePaymentUrls("EPAY", "https://shop.example", {
    notifyUrl: "https://shop.example/api/payments/alipay/notify",
    returnUrl: "https://shop.example/payment-result",
  })), "PAYMENT_NOTIFY_URL_INVALID");
  assert.equal(appErrorCode(() => mergePaymentUrls("EPAY", "https://shop.example", {
    notifyUrl: "https://shop.example/api/payments/epay/notify",
    returnUrl: "https://other.example/payment-result",
  })), "PAYMENT_RETURN_URL_INVALID");
});

test("payment provider config preserves, replaces, and clears sensitive values", () => {
  const preserved = JSON.parse(mergePaymentProviderConfig({
    provider: "EPAY",
    currentConfigJson: JSON.stringify(epayConfig),
    values: { pid: "2000", baseUrl: epayConfig.baseUrl, epayChannels: ["wxpay"], notifyUrl: epayConfig.notifyUrl, returnUrl: epayConfig.returnUrl },
    secretUpdates: { key: { action: "keepExisting" } },
  }));
  assert.equal(preserved.key, "old-secret");
  assert.equal(preserved.pid, "2000");

  const replaced = JSON.parse(mergePaymentProviderConfig({
    provider: "EPAY",
    currentConfigJson: JSON.stringify(epayConfig),
    values: { pid: epayConfig.pid, baseUrl: epayConfig.baseUrl, epayChannels: epayConfig.epayChannels, notifyUrl: epayConfig.notifyUrl, returnUrl: epayConfig.returnUrl },
    secretUpdates: { key: { action: "value", value: "new-secret" } },
  }));
  assert.equal(replaced.key, "new-secret");

  assert.equal(appErrorCode(() => mergePaymentProviderConfig({
    provider: "EPAY",
    currentConfigJson: JSON.stringify(epayConfig),
    values: { pid: epayConfig.pid, baseUrl: epayConfig.baseUrl, epayChannels: epayConfig.epayChannels, notifyUrl: epayConfig.notifyUrl, returnUrl: epayConfig.returnUrl },
    secretUpdates: { key: { action: "clear" } },
  })), "PAYMENT_CONFIG_INVALID");
});

test("payment provider config rejects unknown fields and secret updates", () => {
  assert.equal(appErrorCode(() => mergePaymentProviderConfig({
    provider: "EPAY",
    currentConfigJson: JSON.stringify(epayConfig),
    values: { ...epayConfig, unknown: "unexpected" },
    secretUpdates: {},
  })), "PAYMENT_CONFIG_INVALID");
  assert.equal(appErrorCode(() => mergePaymentProviderConfig({
    provider: "EPAY",
    currentConfigJson: JSON.stringify(epayConfig),
    values: { pid: epayConfig.pid, baseUrl: epayConfig.baseUrl, epayChannels: epayConfig.epayChannels, notifyUrl: epayConfig.notifyUrl, returnUrl: epayConfig.returnUrl },
    secretUpdates: { pid: { action: "keepExisting" } },
  })), "PAYMENT_CONFIG_INVALID");
});

test("Epay adapter creates a signed redirect URL", async () => {
  const adapter = createProviderAdapter("EPAY", epayConfig);
  const payment = await adapter.create({ orderNo: "ORD-1", queryToken: "token", amount: 1234, subject: "Order", channel: "wxpay", notifyUrl: epayConfig.notifyUrl, returnUrl: epayConfig.returnUrl });
  assert.equal(payment.mode, "redirect");
  const url = new URL(payment.url!);
  assert.equal(url.pathname, "/submit.php");
  assert.equal(url.searchParams.get("pid"), "1000");
  assert.equal(url.searchParams.get("type"), "wxpay");
  assert.equal(url.searchParams.get("money"), "12.34");
  assert.equal(url.searchParams.get("sign_type"), "MD5");
  assert.ok(url.searchParams.get("sign"));
});

test("BEpusdt and Stripe adapters create provider requests and surface failures", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.includes("bepusdt")) return new Response(`\uFEFF${JSON.stringify({ status_code: 200, data: { payment_url: "https://cashier.example/pay", trade_id: "TRADE-1" } })}`, { status: 200 });
    return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.example/session" }), { status: 200 });
  };
  try {
    const bepusdt = createProviderAdapter("BEPUSDT", { schemaVersion: 1, baseUrl: "https://bepusdt.example", appSecret: "secret", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    const bepPayment = await bepusdt.create({ orderNo: "ORD-2", queryToken: "token", amount: 200, subject: "Order", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    assert.deepEqual(bepPayment, { mode: "redirect", url: "https://cashier.example/pay", paymentOrderNo: "TRADE-1" });

    const stripe = createProviderAdapter("STRIPE", { schemaVersion: 1, secretKey: "sk_test", webhookSecret: "whsec_test", currency: "usd", notifyUrl: "https://shop.example/api/payments/stripe/notify", returnUrl: "https://shop.example/result" });
    const stripePayment = await stripe.create({ orderNo: "ORD-3", queryToken: "token", amount: 1234, subject: "Order", notifyUrl: "", returnUrl: "https://shop.example/result" });
    assert.equal(stripePayment.paymentOrderNo, "cs_1");
    assert.equal(requests.length, 2);
    assert.equal(JSON.parse(await requests[0]!.text()).signature.length, 32);
    const stripePayload = new URLSearchParams(await requests[1]!.text());
    assert.equal(stripePayload.get("line_items[0][price_data][unit_amount]"), "1234");
    assert.equal(stripePayload.get("metadata[orderNo]"), "ORD-3");
    assert.equal(stripePayload.get("payment_intent_data[metadata][orderNo]"), "ORD-3");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Alipay web and face-to-face modes create signed provider requests", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return new Response(JSON.stringify({ alipay_trade_precreate_response: { code: "10000", out_trade_no: "ORD-5", qr_code: "https://qr.example/code" } }), { status: 200 });
  };
  try {
    const adapter = createProviderAdapter("ALIPAY", { schemaVersion: 1, modes: ["web", "face_to_face"], baseUrl: "https://openapi.alipay.example", appId: "app-1", privateKey: testPrivateKey, alipayPublicKey: "unused-for-create", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    const web = await adapter.create({ orderNo: "ORD-5", queryToken: "token", amount: 1234, subject: "Order", channel: "web", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    assert.equal(web.mode, "redirect");
    const webUrl = new URL(web.url!);
    assert.equal(webUrl.searchParams.get("method"), "alipay.trade.page.pay");
    assert.ok(webUrl.searchParams.get("sign"));

    const wap = await adapter.create({ orderNo: "ORD-5", queryToken: "token", amount: 1234, subject: "Order", channel: "wap", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    const wapPayload = new URL(wap.url!).searchParams;
    assert.equal(wapPayload.get("method"), "alipay.trade.wap.pay");
    assert.equal(JSON.parse(wapPayload.get("biz_content")!).product_code, "QUICK_WAP_WAY");

    const faceToFace = await adapter.create({ orderNo: "ORD-5", queryToken: "token", amount: 1234, subject: "Order", channel: "face_to_face", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    assert.deepEqual(faceToFace, { mode: "qr", qrCode: "https://qr.example/code", paymentOrderNo: "ORD-5" });
    assert.equal(requests.length, 1);
    const faceUrl = new URL(requests[0]!.url);
    assert.equal(faceUrl.searchParams.get("method"), "alipay.trade.precreate");
    assert.equal(JSON.parse(faceUrl.searchParams.get("biz_content")!).product_code, "QR_CODE_OFFLINE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HashPay adapter creates a signed provider request", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ checkoutUrl: "https://hashpay.example/checkout", order: { id: "HP-1" } }), { status: 200 });
  };
  try {
    const adapter = createProviderAdapter("HASHPAY", { schemaVersion: 1, baseUrl: "https://hashpay.example", merchantId: "merchant-1", privateKey: testPrivateKey, currency: "USD", notifyUrl: "https://shop.example/api/payments/hashpay/notify", returnUrl: "https://shop.example/result" });
    const payment = await adapter.create({ orderNo: "ORD-6", queryToken: "token", amount: 999, subject: "Order", notifyUrl: "", returnUrl: "https://shop.example/result" });
    assert.deepEqual(payment, { mode: "redirect", url: "https://hashpay.example/checkout", paymentOrderNo: "HP-1" });
    assert.equal(request!.headers.get("X-Merchant-Id"), "merchant-1");
    assert.ok(request!.headers.get("X-Signature"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Epay and BEpusdt callbacks reject invalid signatures", async () => {
  const epay = createProviderAdapter("EPAY", epayConfig);
  const epayResult = await epay.verify({ payload: { pid: "1000", out_trade_no: "ORD-7", money: "1.00", trade_status: "TRADE_SUCCESS", sign: "invalid", sign_type: "MD5" } });
  assert.equal(epayResult.verified, false);

  const bepusdt = createProviderAdapter("BEPUSDT", { schemaVersion: 1, baseUrl: "https://bepusdt.example", appSecret: "secret", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
  const bepusdtResult = await bepusdt.verify({ payload: { order_id: "ORD-7", trade_id: "TRADE-7", amount: "1.00", status: "2", signature: "invalid" } });
  assert.equal(bepusdtResult.verified, false);
  assert.equal(bepusdtResult.status, "PAID");
});

test("BEpusdt create rejects incomplete or non-success gateway responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status_code: 200, data: {} }), { status: 200 });
  try {
    const adapter = createProviderAdapter("BEPUSDT", { schemaVersion: 1, baseUrl: "https://bepusdt.example", appSecret: "secret", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" });
    await assert.rejects(() => adapter.create({ orderNo: "ORD-8", queryToken: "token", amount: 100, subject: "Order", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" }), /BEPUSDT_CREATE_FAILED/);
    globalThis.fetch = async () => new Response(JSON.stringify({ status_code: 400, data: { payment_url: "https://cashier.example/pay" } }), { status: 200 });
    await assert.rejects(() => adapter.create({ orderNo: "ORD-9", queryToken: "token", amount: 100, subject: "Order", notifyUrl: "https://shop.example/notify", returnUrl: "https://shop.example/result" }), /BEPUSDT_CREATE_FAILED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe active query verifies order ownership before confirming payment", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "cs_1", metadata: { orderNo: "ORD-4" }, amount_total: 100, currency: "usd", payment_status: "paid" }), { status: 200 });
  try {
    const adapter = createProviderAdapter("STRIPE", { schemaVersion: 1, secretKey: "sk_test", webhookSecret: "whsec_test", currency: "usd", notifyUrl: "https://shop.example/api/payments/stripe/notify", returnUrl: "https://shop.example/result" });
    const result = await adapter.query!({ orderNo: "ORD-4", paymentOrderNo: "cs_1", amount: 100 });
    assert.deepEqual(result, { provider: "STRIPE", verified: true, orderNo: "ORD-4", paymentOrderNo: "cs_1", amount: 100, currency: "usd", status: "PAID", message: "STRIPE_QUERY" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe active query rejects a session owned by another order", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "cs_1", metadata: { orderNo: "ORD-other" }, amount_total: 100, currency: "usd", payment_status: "paid" }), { status: 200 });
  try {
    const adapter = createProviderAdapter("STRIPE", { schemaVersion: 1, secretKey: "sk_test", webhookSecret: "whsec_test", currency: "usd", notifyUrl: "https://shop.example/api/payments/stripe/notify", returnUrl: "https://shop.example/result" });
    const result = await adapter.query!({ orderNo: "ORD-4", paymentOrderNo: "cs_1", amount: 100 });
    assert.deepEqual(result, { provider: "STRIPE", verified: false, orderNo: "ORD-4", paymentOrderNo: "cs_1", status: "PENDING", message: "STRIPE_QUERY_FAILED" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
