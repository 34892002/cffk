// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, expect, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import type { Database } from "bun:sqlite";
import { processOrderEvents } from "../../server/email/order-events.ts";
import { createOrder, confirmOrderPayment, getOrderForQuery } from "../../server/order/service.ts";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

type FlowIdentity = {
  name: string;
  ownerUserId: string | null;
  email: string;
};

type SentEmail = {
  to: string;
  subject: string;
  text?: string;
};

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

function insertFixtures(sqlite: Database, identity: FlowIdentity) {
  const now = Date.now();
  if (identity.ownerUserId) {
    sqlite.query("INSERT INTO user (id, name, email, emailVerified, twoFactorEnabled, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, ?, ?)")
      .run(identity.ownerUserId, identity.name, identity.email, now, now);
  }
  sqlite.query("INSERT INTO siteSetting (id, siteName, siteUrl, registrationEnabled, timezone, createdAt, updatedAt) VALUES (1, 'Core Shop', 'https://shop.example.com', 1, 'Asia/Shanghai', ?, ?)").run(now, now);
  sqlite.query("INSERT INTO product (name, slug, price, status, deliveryType, fixedDeliveryContent, stockMode, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES ('Core product', ?, 1000, 'ACTIVE', 'FIXED_CARD', 'LICENSE-CORE-001', 'UNLIMITED', 1, 1, 0, ?, ?)")
    .run(`core-${identity.ownerUserId ?? "guest"}`, now, now);
  sqlite.query("INSERT INTO discountCode (code, type, value, usedCount, reservedCount, isActive, createdAt, updatedAt) VALUES (?, 'FIXED', 1000, 0, 0, 1, ?, ?)")
    .run(`FREE-${(identity.ownerUserId ?? "GUEST").toUpperCase()}`, now, now);
  sqlite.query("INSERT INTO pushChannelConfig (channel, provider, name, isEnabled, configJson, createdAt, updatedAt) VALUES ('EMAIL', 'CLOUDFLARE', 'Test Email', 1, ?, ?, ?)")
    .run(JSON.stringify({ schemaVersion: 1, kind: "cloudflare", from: "shop@example.com" }), now, now);
  for (const scene of ["ORDER_PAID", "DELIVERY_SUCCESS"] as const) {
    sqlite.query("INSERT INTO emailTemplate (scene, name, templateJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
      .run(scene, scene, JSON.stringify({ schemaVersion: 1, format: "text", subject: `${scene} {{orderNo}}`, body: "{{queryUrl}}\n{{deliveryItems}}" }), now, now);
  }
}

async function runStorefrontFlow(identity: FlowIdentity) {
  const context = createTestDatabase();
  databases.push(context);
  insertFixtures(context.sqlite, identity);
  const product = context.sqlite.query("SELECT id FROM product LIMIT 1").get() as { id: number };
  const discountCode = `FREE-${(identity.ownerUserId ?? "GUEST").toUpperCase()}`;
  const sent: SentEmail[] = [];

  const created = await createOrder(context.database, {
    productId: product.id,
    quantity: 1,
    paymentProvider: "ALIPAY",
    contactType: "EMAIL",
    contactValue: identity.email,
    discountCode,
  }, identity.ownerUserId);
  expect(created).toMatchObject({ amount: 0, originalAmount: 1000, discountAmount: 1000, discountCode });

  expect(await confirmOrderPayment(context.database, created.id)).toEqual({ outcome: "CONFIRMED" });
  const order = context.sqlite.query("SELECT ownerUserId, status, paymentStatus, deliveryStatus FROM `order` WHERE id = ?").get(created.id);
  expect(order).toEqual({ ownerUserId: identity.ownerUserId, status: "DELIVERED", paymentStatus: "PAID", deliveryStatus: "DELIVERED" });
  expect(context.sqlite.query("SELECT usedCount, reservedCount FROM discountCode WHERE code = ?").get(discountCode)).toEqual({ usedCount: 1, reservedCount: 0 });

  const eventResult = await processOrderEvents(context.database, {
    EMAIL: {
      async send(message: SentEmail) {
        sent.push(message);
        return { messageId: `test-${sent.length}` };
      },
    },
  });
  expect(eventResult).toEqual({ attempted: 2, processed: 2, failed: 0 });

  expect(context.sqlite.query("SELECT scene, status FROM orderEvent ORDER BY id").all()).toEqual([
    { scene: "ORDER_PAID", status: "PROCESSED" },
    { scene: "DELIVERY_SUCCESS", status: "PROCESSED" },
  ]);
  expect(sent.map((message) => message.subject)).toEqual([
    `ORDER_PAID ${created.orderNo}`,
    `DELIVERY_SUCCESS ${created.orderNo}`,
  ]);
  expect(sent.every((message) => message.to === identity.email)).toBe(true);
  expect(sent[1]?.text).toContain("LICENSE-CORE-001");

  return { context, created };
}

describe("core storefront flows", () => {
  test("guest uses a full discount, receives delivery, and triggers both push nodes", async () => {
    const identity = { name: "Guest", ownerUserId: null, email: "guest@example.com" };
    const { context, created } = await runStorefrontFlow(identity);

    const queried = await getOrderForQuery(context.database, created.orderNo, null, identity.email);
    expect(queried).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID", deliveries: ["LICENSE-CORE-001"] });
    expect(await getOrderForQuery(context.database, created.orderNo, null, "other@example.com")).toBeNull();
  });

  test("account user owns the same purchase flow and queries it through the account", async () => {
    const identity = { name: "Core User", ownerUserId: "core-user", email: "user@example.com" };
    const { context, created } = await runStorefrontFlow(identity);

    const queried = await getOrderForQuery(context.database, created.orderNo, identity.ownerUserId);
    expect(queried).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID", deliveries: ["LICENSE-CORE-001"] });
    expect(await getOrderForQuery(context.database, created.orderNo, "another-user")).toBeNull();
  });
});
