// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function applyMigration(sqlite: Database, migrationName: string) {
  const path = fileURLToPath(new URL(`../../database/migrations/${migrationName}`, import.meta.url));
  const statements = readFileSync(path, "utf8").split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
  for (const statement of statements) sqlite.run(statement);
}

describe("legacy product migration", () => {
  test("migrates historical orders, cards, reservations, and foreign keys", () => {
    const sqlite = new Database(":memory:");
    sqlite.run("PRAGMA foreign_keys = ON");
    applyMigration(sqlite, "0000_initial.sql");
    const now = Date.now();

    sqlite.query("INSERT INTO product (id, name, slug, price, status, deliveryType, fixedDeliveryContent, physicalStock, minBuy, maxBuy, createdAt, updatedAt) VALUES (7, 'Legacy', 'legacy', 1250, 'ACTIVE', 'CARD_AUTO', NULL, 10, 1, 5, ?, ?)").run(now, now);
    sqlite.query("INSERT INTO discountCode (id, code, type, value, reservedCount, isActive, createdAt, updatedAt) VALUES (3, 'OLD10', 'PERCENT', 10, 1, 1, ?, ?)").run(now, now);

    const orderValues = [
      "old-pending", null, 7, "Legacy", 1250, 3, 3750, "EMAIL", "buyer@example.com", "buyer@example.com", null, null,
      "ALIPAY", null, "CARD_AUTO", null, 1, "PENDING", "UNPAID", "NOT_DELIVERED", null, null, 3, "OLD10", 3750, 375, null, null, null, now, now,
    ];
    sqlite.query("INSERT INTO `order` (orderNo, ownerUserId, productId, productNameSnapshot, unitPrice, quantity, amount, contactType, contactValue, contactEmailNormalized, buyerNote, addressSnapshotJson, paymentProvider, paymentChannel, deliveryTypeSnapshot, fixedDeliveryContentSnapshot, physicalStockReserved, status, paymentStatus, deliveryStatus, deliveryToken, deliveryLeaseUntil, discountCodeId, discountCodeStr, originalAmount, discountAmount, paidAt, deliveredAt, closedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(...orderValues);
    const pendingOrder = sqlite.query("SELECT id FROM `order` WHERE orderNo = 'old-pending'").get() as { id: number };
    sqlite.query("INSERT INTO card (productId, content, status, orderId, createdAt, updatedAt) VALUES (7, 'CARD-OLD', 'UNUSED', ?, ?, ?)").run(pendingOrder.id, now, now);
    sqlite.query("INSERT INTO automaticDeliveryJob (orderId, createdAt, updatedAt) VALUES (?, ?, ?)").run(pendingOrder.id, now, now);
    sqlite.query("INSERT INTO paymentAttempt (orderId, provider, status, createdAt, updatedAt) VALUES (?, 'ALIPAY', 'CREATING', ?, ?)").run(pendingOrder.id, now, now);
    sqlite.query("INSERT INTO orderEvent (eventKey, orderId, scene, availableAt, createdAt, updatedAt) VALUES ('legacy-event', ?, 'PAYMENT', ?, ?, ?)").run(pendingOrder.id, now, now, now);

    sqlite.query("INSERT INTO `order` (orderNo, productId, productNameSnapshot, unitPrice, quantity, amount, contactType, paymentProvider, deliveryTypeSnapshot, physicalStockReserved, status, paymentStatus, deliveryStatus, createdAt, updatedAt) VALUES ('old-paid', 7, 'Legacy', 1250, 1, 1250, 'EMAIL', 'ALIPAY', 'CARD_AUTO', 0, 'PAID', 'PAID', 'DELIVERED', ?, ?)").run(now, now);
    const paidOrder = sqlite.query("SELECT id FROM `order` WHERE orderNo = 'old-paid'").get() as { id: number };
    sqlite.query("INSERT INTO orderDelivery (orderId, deliveryType, attemptToken, status, createdAt) VALUES (?, 'CARD_AUTO', 'legacy-token', 'SUCCESS', ?)").run(paidOrder.id, now);

    applyMigration(sqlite, "0001_flowery_doomsday.sql");

    expect(sqlite.query("SELECT id, name, slug FROM product_v2 WHERE id = 7").get()).toEqual({ id: 7, name: "Legacy", slug: "legacy" });
    expect(sqlite.query("SELECT price, deliveryType, physicalStock, minBuy, maxBuy FROM productSku WHERE productId = 7").get()).toEqual({ price: 1250, deliveryType: "CARD_AUTO", physicalStock: 13, minBuy: 1, maxBuy: 5 });
    expect(sqlite.query("SELECT productId, productSkuId, status, physicalStockReserved FROM `order` WHERE orderNo = 'old-pending'").get()).toMatchObject({ productId: 7, productSkuId: 1, status: "CLOSED", physicalStockReserved: 0 });
    expect(sqlite.query("SELECT status, paymentStatus FROM `order` WHERE orderNo = 'old-paid'").get()).toEqual({ status: "PAID", paymentStatus: "PAID" });
    expect(sqlite.query("SELECT productId, productSkuId FROM card WHERE content = 'CARD-OLD'").get()).toEqual({ productId: 7, productSkuId: 1 });
    expect(sqlite.query("SELECT reservedCount FROM discountCode WHERE id = 3").get()).toEqual({ reservedCount: 0 });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM automaticDeliveryJob WHERE orderId = ?").get(pendingOrder.id)).toEqual({ count: 1 });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM orderDelivery WHERE orderId = ?").get(paidOrder.id)).toEqual({ count: 1 });

    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => sqlite.query("SELECT COUNT(*) AS count FROM product").get()).toThrow();

    sqlite.close();
  });
});
