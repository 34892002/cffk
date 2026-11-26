import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import type { Database } from "bun:sqlite";
import { AppError } from "../../lib/app-error";
import { previewDiscount } from "../../server/discount/service";
import { createOrder } from "../../server/order/service.ts";
import { invalidateSiteSettings } from "../../server/site/public-settings";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  invalidateSiteSettings();
  while (databases.length) databases.pop()!.close();
});

async function errorCode(operation: () => Promise<unknown>) {
  try {
    await operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : String(cause);
  }
}

/**
 * Product 1 owns SKU 10; product 2 owns SKU 1. The SKU id deliberately equals
 * another product's id so the old "compare SKU id with productIds" bug shows up.
 */
function seed(sqlite: Database) {
  const now = Date.now();
  sqlite.query("INSERT INTO siteSetting (id, siteName, timezone, currency, exchangeRate, registrationEnabled, createdAt, updatedAt) VALUES (1, 'Shop', 'Asia/Shanghai', 'CNY', 1, 0, ?, ?)").run(now, now);
  sqlite.query("INSERT INTO product_v2 (id, name, slug, status, sort, createdAt, updatedAt) VALUES (1, 'Product One', 'product-one', 'ACTIVE', 0, ?, ?), (2, 'Product Two', 'product-two', 'ACTIVE', 0, ?, ?)").run(now, now, now, now);
  sqlite.query("INSERT INTO productSku (id, productId, name, price, status, deliveryType, fixedDeliveryContent, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (10, 1, 'P1 SKU', 1000, 'ACTIVE', 'FIXED_CARD', 'CODE-P1', 1, 1, 0, ?, ?), (1, 2, 'P2 SKU', 1000, 'ACTIVE', 'FIXED_CARD', 'CODE-P2', 1, 1, 0, ?, ?)").run(now, now, now, now);
  sqlite.query("INSERT INTO discountCode (code, type, value, productIds, isActive, usedCount, reservedCount, createdAt, updatedAt) VALUES ('P1', 'FIXED', 100, '1', 1, 0, 0, ?, ?)").run(now, now);
}

function orderInput(productId: number, productSkuId: number) {
  return { productId, productSkuId, quantity: 1, paymentProvider: "ALIPAY" as const, contactType: "EMAIL" as const, contactValue: "buyer@example.com", discountCode: "P1" };
}

describe("discount product scope", () => {
  test("applies a product-scoped coupon to its product even when the SKU id differs", async () => {
    const context = createTestDatabase();
    databases.push(context);
    seed(context.sqlite);
    invalidateSiteSettings();

    const preview = await previewDiscount(context.database, { productId: 1, productSkuId: 10, quantity: 1, discountCode: "P1" });
    assert.equal(preview.code, "P1");
    assert.ok(preview.finalAmount.includes("9.00"), preview.finalAmount);

    const created = await createOrder(context.database, orderInput(1, 10), null);
    assert.equal(created.originalAmount, 1000);
    assert.equal(created.discountAmount, 100);
  });

  test("rejects a product-scoped coupon for another product whose SKU id matches the scope", async () => {
    const context = createTestDatabase();
    databases.push(context);
    seed(context.sqlite);
    invalidateSiteSettings();

    assert.equal(
      await errorCode(() => previewDiscount(context.database, { productId: 2, productSkuId: 1, quantity: 1, discountCode: "P1" })),
      "DISCOUNT_CODE_PRODUCT_NOT_ALLOWED",
    );
    assert.equal(
      await errorCode(() => createOrder(context.database, orderInput(2, 1), null)),
      "DISCOUNT_CODE_PRODUCT_NOT_ALLOWED",
    );
  });
});