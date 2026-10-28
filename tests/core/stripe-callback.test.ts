import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, test } from "bun:test";
import { PaymentCallbackService } from "../../server/payment/callback-service";
import { normalizePaymentCallbackPayload } from "../../server/payment/callback-payload";
import { createProviderAdapter } from "../../server/payment/providers";
import { createTestDatabase } from "../helpers/sqlite-d1";

const config = {
  schemaVersion: 1,
  secretKey: "sk_test_local_fixture",
  webhookSecret: "whsec_local_fixture",
  currency: "cny",
  notifyUrl: "https://shop.example/api/payments/stripe/notify",
  returnUrl: "https://shop.example/payment-result",
};
const session = {
  id: "cs_local_fixture",
  metadata: { orderNo: "ORD-STRIPE-FIXTURE" },
  amount_total: 800,
  currency: "cny",
  payment_status: "paid",
};
const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

function fixture() {
  const context = createTestDatabase();
  databases.push(context);
  const now = Date.now();
  context.sqlite.query("INSERT INTO paymentProvider (provider,name,isEnabled,configJson,createdAt,updatedAt) VALUES ('STRIPE','Stripe',1,?,?,?) ON CONFLICT(provider) DO UPDATE SET configJson=excluded.configJson,isEnabled=1")
    .run(JSON.stringify(config), now, now);
  context.sqlite.query("INSERT INTO [order] (orderNo,productNameSnapshot,unitPrice,quantity,amount,paymentProvider,deliveryTypeSnapshot,fixedDeliveryContentSnapshot,createdAt,updatedAt) VALUES (?, 'Fixture',800,1,800,'STRIPE','FIXED_CARD','FIXTURE-LICENSE',?,?)")
    .run(session.metadata.orderNo, now, now);
  context.sqlite.query("INSERT INTO paymentAttempt (orderId,provider,paymentOrderNo,status,createdAt,updatedAt) SELECT id,'STRIPE',?,'PENDING',?,? FROM [order] WHERE orderNo=?")
    .run(session.id, now, now, session.metadata.orderNo);
  return {
    ...context,
    service: new PaymentCallbackService(context.database),
    order: () => context.sqlite.query("SELECT paymentStatus,deliveryStatus FROM [order] WHERE orderNo=?").get(session.metadata.orderNo),
    attempt: () => context.sqlite.query("SELECT status FROM paymentAttempt WHERE paymentOrderNo=?").get(session.id),
    notifications: () => context.sqlite.query("SELECT verifyStatus,message FROM paymentLog WHERE eventType='NOTIFY' ORDER BY id").all(),
  };
}

function signedInput(type: string, object: Record<string, unknown>, options: { secret?: string; timestamp?: number } = {}) {
  const rawBody = JSON.stringify({ id: "evt_local_fixture", type, data: { object } });
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", options.secret ?? config.webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  return {
    rawBody,
    payload: normalizePaymentCallbackPayload("POST", config.notifyUrl, rawBody, "STRIPE"),
    headers: new Headers({ "Stripe-Signature": `t=${timestamp},v1=${signature}` }),
  };
}

for (const [type, object] of [
  ["capability.updated", { id: "cap_fixture" }],
  ["checkout.session.expired", { ...session, payment_status: "unpaid" }],
  ["checkout.session.async_payment_failed", { ...session, payment_status: "unpaid" }],
  ["payment_intent.succeeded", { ...session, id: "pi_fixture" }],
] as const) {
  test(`Stripe acknowledges ${type} without changing payment or delivery`, async () => {
    const context = fixture();
    const response = await context.service.handle("STRIPE", signedInput(type, object));
    assert.equal(response.status, 200);
    assert.equal(response.body, "success");
    assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
    assert.deepEqual(context.attempt(), { status: "PENDING" });
    assert.deepEqual(context.notifications(), [{ verifyStatus: "VERIFIED", message: "STRIPE_EVENT_IGNORED" }]);
    assert.deepEqual(context.sqlite.query("SELECT id FROM orderEvent").all(), []);
  });
}

test("Stripe acknowledges an unpaid completed session and waits for asynchronous payment", async () => {
  const context = fixture();
  const response = await context.service.handle("STRIPE", signedInput("checkout.session.completed", { ...session, payment_status: "unpaid" }));
  assert.equal(response.status, 200);
  assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
  assert.deepEqual(context.attempt(), { status: "PENDING" });
  assert.deepEqual(context.notifications(), [{ verifyStatus: "VERIFIED", message: "STRIPE_PAYMENT_PENDING" }]);
});

for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
  test(`Stripe ${type} confirms and delivers a matching paid order only once`, async () => {
    const context = fixture();
    const input = signedInput(type, session);
    assert.equal((await context.service.handle("STRIPE", input)).status, 200);
    assert.deepEqual(context.order(), { paymentStatus: "PAID", deliveryStatus: "DELIVERED" });
    assert.deepEqual(context.attempt(), { status: "PAID" });
    assert.equal((await context.service.handle("STRIPE", input)).status, 200);
    assert.deepEqual(context.sqlite.query("SELECT status FROM orderDelivery").all(), [{ status: "SUCCESS" }]);
    assert.deepEqual(context.sqlite.query("SELECT scene FROM orderEvent ORDER BY id").all(), [{ scene: "ORDER_PAID" }, { scene: "DELIVERY_SUCCESS" }]);
    assert.deepEqual(context.notifications(), [
      { verifyStatus: "VERIFIED", message: "CONFIRMED" },
      { verifyStatus: "VERIFIED", message: "ALREADY_PAID" },
    ]);
  });

  for (const [name, object] of [
    ["wrong amount", { ...session, amount_total: 801 }],
    ["wrong currency", { ...session, currency: "usd" }],
    ["unknown order", { ...session, metadata: { orderNo: "ORD-UNKNOWN" } }],
    ["unknown attempt", { ...session, id: "cs_unknown" }],
    ["missing amount", { ...session, amount_total: undefined }],
  ] as const) {
    test(`Stripe rejects ${type} with ${name}`, async () => {
      const context = fixture();
      assert.equal((await context.service.handle("STRIPE", signedInput(type, object))).status, 400);
      assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
      assert.deepEqual(context.attempt(), { status: "PENDING" });
      assert.deepEqual(context.notifications(), [{ verifyStatus: "FAILED", message: "PAYMENT_CALLBACK_INVALID" }]);
    });
  }
}

for (const type of ["capability.updated", "checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
  for (const invalidSignature of ["missing", "wrong secret", "expired"]) {
    test(`Stripe rejects ${type} with ${invalidSignature} signature`, async () => {
      const context = fixture();
      const input = signedInput(type, session, {
        secret: invalidSignature === "wrong secret" ? "whsec_wrong_fixture" : undefined,
        timestamp: invalidSignature === "expired" ? Math.floor(Date.now() / 1000) - 600 : undefined,
      });
      if (invalidSignature === "missing") input.headers.delete("Stripe-Signature");
      assert.equal((await context.service.handle("STRIPE", input)).status, 400);
      assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
      assert.deepEqual(context.notifications(), [{ verifyStatus: "FAILED", message: "PAYMENT_CALLBACK_VERIFY_FAILED" }]);
    });
  }
}

test("Stripe does not confirm an unpaid async success event", async () => {
  const context = fixture();
  assert.equal((await context.service.handle("STRIPE", signedInput("checkout.session.async_payment_succeeded", { ...session, payment_status: "unpaid" }))).status, 400);
  assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
});

test("Stripe does not acknowledge a signed payload without an event type", async () => {
  const context = fixture();
  assert.equal((await context.service.handle("STRIPE", signedInput("", session))).status, 400);
  assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
});

test("Stripe preserves zero-decimal amounts when creating and querying sessions", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = new URLSearchParams();
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") requestBody = new URLSearchParams(String(init.body));
    return new Response(JSON.stringify({ ...session, currency: "jpy", url: "https://checkout.stripe.example/session" }), { status: 200 });
  };
  try {
    const adapter = createProviderAdapter("STRIPE", { ...config, currency: "jpy" });
    await adapter.create({ orderNo: session.metadata.orderNo, amount: 800, subject: "Fixture", notifyUrl: config.notifyUrl, returnUrl: config.returnUrl });
    assert.equal(requestBody.get("line_items[0][price_data][currency]"), "jpy");
    assert.equal(requestBody.get("line_items[0][price_data][unit_amount]"), "800");
    assert.equal(requestBody.has("payment_method_types[]"), false);
    const queried = await adapter.query!({ orderNo: session.metadata.orderNo, paymentOrderNo: session.id, amount: 800 });
    assert.equal(queried.verified, true);
    assert.equal(queried.amount, 800);
    assert.equal(queried.status, "PAID");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
  test(`Stripe ${type} delivers a matching zero-decimal currency order`, async () => {
    const context = fixture();
    context.sqlite.query("UPDATE paymentProvider SET configJson=? WHERE provider='STRIPE'").run(JSON.stringify({ ...config, currency: "jpy" }));
    context.sqlite.query("UPDATE [order] SET currency='JPY' WHERE orderNo=?").run(session.metadata.orderNo);
    const response = await context.service.handle("STRIPE", signedInput(type, { ...session, currency: "jpy" }));
    assert.equal(response.status, 200);
    assert.deepEqual(context.order(), { paymentStatus: "PAID", deliveryStatus: "DELIVERED" });
  });

  test(`Stripe ${type} rejects a callback matching configuration but not the order currency`, async () => {
    const context = fixture();
    context.sqlite.query("UPDATE [order] SET currency='USD' WHERE orderNo=?").run(session.metadata.orderNo);
    const response = await context.service.handle("STRIPE", signedInput(type, session));
    assert.equal(response.status, 400);
    assert.deepEqual(context.order(), { paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED" });
  });
}
