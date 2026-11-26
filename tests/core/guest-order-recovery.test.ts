import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import type { Database } from "bun:sqlite";
import { AppError } from "../../lib/app-error";
import { createOrder } from "../../server/order/service.ts";
import { pruneGuestOrderRecoveryChallenges, sendGuestOrderRecoveryCode } from "../../server/order/recovery-service.ts";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

type SentEmail = { to: string; subject: string; text?: string };

function seed(sqlite: Database) {
  const now = Date.now();
  sqlite.query("INSERT INTO siteSetting (id, siteName, siteUrl, registrationEnabled, timezone, createdAt, updatedAt) VALUES (1, 'Core Shop', 'https://shop.example.com', 1, 'Asia/Shanghai', ?, ?)").run(now, now);
  sqlite.query("INSERT INTO product_v2 (name, slug, status, sort, createdAt, updatedAt) VALUES ('Core product', 'core-product', 'ACTIVE', 0, ?, ?)").run(now, now);
  const product = sqlite.query("SELECT id FROM product_v2 WHERE slug = 'core-product'").get() as { id: number };
  sqlite.query("INSERT INTO productSku (productId, name, price, status, deliveryType, fixedDeliveryContent, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (?, 'Default', 1000, 'ACTIVE', 'FIXED_CARD', 'LICENSE-001', 1, 1, 0, ?, ?)").run(product.id, now, now);
  sqlite.query("INSERT INTO pushChannelConfig (channel, provider, name, isEnabled, configJson, createdAt, updatedAt) VALUES ('EMAIL', 'CLOUDFLARE', 'Test Email', 1, ?, ?, ?)")
    .run(JSON.stringify({ schemaVersion: 1, kind: "cloudflare", from: "shop@example.com" }), now, now);
  sqlite.query("INSERT INTO emailTemplate (scene, name, templateJson, createdAt, updatedAt) VALUES ('GUEST_ORDER_RECOVERY', 'Recovery', ?, ?, ?)")
    .run(JSON.stringify({ schemaVersion: 1, format: "text", subject: "{{siteName}} verification", body: "{{code}} valid for {{expiresMinutes}} minutes" }), now, now);
  return product;
}

function newContext() {
  const context = createTestDatabase();
  databases.push(context);
  return { context, product: seed(context.sqlite) };
}

function sendContext(database: D1Database, sent: SentEmail[]) {
  return {
    database,
    secret: "test-recovery-secret",
    runtime: {
      EMAIL: {
        async send(message: SentEmail) {
          sent.push(message);
          return { messageId: `test-${sent.length}` };
        },
      },
    },
  };
}

async function errorCode(operation: () => Promise<unknown>) {
  try {
    await operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : String(cause);
  }
}

async function addGuestOrder(context: ReturnType<typeof createTestDatabase>, productId: number, email: string) {
  const sku = context.sqlite.query("SELECT id FROM productSku WHERE productId = ?").get(productId) as { id: number };
  await createOrder(context.database, {
    productId,
    productSkuId: sku.id,
    quantity: 1,
    paymentProvider: "ALIPAY",
    contactType: "EMAIL",
    contactValue: email,
  }, null);
}

describe("guest order recovery code delivery", () => {
  test("returns a challenge for an email without orders without sending mail", async () => {
    const { context } = newContext();
    const sent: SentEmail[] = [];

    const startedAt = Date.now();
    const result = await sendGuestOrderRecoveryCode({ email: "nobody@example.com" }, sendContext(context.database, sent));
    const elapsed = Date.now() - startedAt;

    assert.match(result.challengeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(result.expiresAt.getTime() > Date.now());
    assert.ok(elapsed >= 1_900, `expected the timing pad, took ${elapsed}ms`);
    assert.equal((context.sqlite.query("SELECT COUNT(*) AS count FROM guestOrderRecoveryChallenge WHERE emailNormalized = ?").get("nobody@example.com") as { count: number }).count, 1);
    assert.equal(sent.length, 0);
    assert.equal((context.sqlite.query("SELECT COUNT(*) AS count FROM pushLog").get() as { count: number }).count, 0);
  });

  test("rate limits repeat sends for emails without orders", async () => {
    const { context } = newContext();
    const delivery = sendContext(context.database, []);

    await sendGuestOrderRecoveryCode({ email: "nobody@example.com" }, delivery);
    assert.equal(await errorCode(() => sendGuestOrderRecoveryCode({ email: "nobody@example.com" }, delivery)), "OTP_RATE_LIMITED");
  });

  test("rate limits repeat sends for emails that own orders the same way", async () => {
    const { context, product } = newContext();
    await addGuestOrder(context, product.id, "buyer@example.com");
    const delivery = sendContext(context.database, []);

    await sendGuestOrderRecoveryCode({ email: "buyer@example.com" }, delivery);
    assert.equal(await errorCode(() => sendGuestOrderRecoveryCode({ email: "buyer@example.com" }, delivery)), "OTP_RATE_LIMITED");
  });

  test("sends a code when the email owns a guest order", async () => {
    const { context, product } = newContext();
    await addGuestOrder(context, product.id, "buyer@example.com");
    const sent: SentEmail[] = [];

    const result = await sendGuestOrderRecoveryCode({ email: "Buyer@Example.com" }, sendContext(context.database, sent));

    assert.ok(result.challengeId);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, "buyer@example.com");
    assert.match(sent[0]!.text ?? "", /^\d{6} valid for 10 minutes$/);
    assert.deepEqual(context.sqlite.query("SELECT channel, status FROM pushLog").get(), { channel: "EMAIL", status: "SUCCESS" });
  });

  test("prunes expired challenges and keeps live ones", async () => {
    const { context } = newContext();
    const now = Date.now();
    const insert = context.sqlite.query("INSERT INTO guestOrderRecoveryChallenge (id, emailNormalized, codeHash, expiresAt, attemptCount, consumedAt, createdAt) VALUES (?, ?, 'hash', ?, 0, NULL, ?)");
    insert.run("expired", "old@example.com", now - 2 * 60 * 60 * 1000, now - 2 * 60 * 60 * 1000);
    insert.run("live", "new@example.com", now + 10 * 60 * 1000, now);

    assert.equal(await pruneGuestOrderRecoveryChallenges(context.database, new Date(now)), 1);
    assert.deepEqual(context.sqlite.query("SELECT id FROM guestOrderRecoveryChallenge").all(), [{ id: "live" }]);
  });
});
