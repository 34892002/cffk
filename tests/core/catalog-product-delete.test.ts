// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "../../database/drizzle";
import { order, productSku, productV2, supplierBinding } from "../../database/drizzle/schema";
import { createTestDatabase } from "../helpers/sqlite-d1";

describe("catalog product deletion", () => {
  test("removes an imported supplier product and its binding when it has no orders", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      const [product] = await db.insert(productV2).values({ name: "Supplier product", slug: "supplier-product", status: "DRAFT", createdAt: now, updatedAt: now }).returning();
      const [sku] = await db.insert(productSku).values({ productId: product!.id, name: "Supplier SKU", price: 100, fulfillmentSource: "SUPPLIER", deliveryType: "SUPPLIER", status: "INACTIVE", minBuy: 1, maxBuy: 1, createdAt: now, updatedAt: now }).returning();
      await db.insert(supplierBinding).values({ productSkuId: sku!.id, provider: "dujiao_next", normalizedApiOrigin: "https://supplier.example", protocolVersion: "1.3.1-upstream-v1", upstreamProductId: "product-1", upstreamSkuId: "sku-1", upstreamProductName: "Supplier product", upstreamSkuName: "Supplier SKU", referenceCostMinor: "10", maxCostMinor: "10", createdAt: now, updatedAt: now });

      await db.delete(productSku).where(eq(productSku.productId, product!.id));
      await db.delete(productV2).where(eq(productV2.id, product!.id));

      expect(await db.select().from(productV2)).toHaveLength(0);
      expect(await db.select().from(productSku)).toHaveLength(0);
      expect(await db.select().from(supplierBinding)).toHaveLength(0);
    } finally {
      close();
    }
  });

  test("keeps a closed unpaid order snapshot when its product is deleted", async () => {
    const { database, sqlite, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = Date.now();
      const [product] = await db.insert(productV2).values({ name: "Expired product", slug: "expired-product", status: "DRAFT", createdAt: new Date(now), updatedAt: new Date(now) }).returning();
      const [sku] = await db.insert(productSku).values({ productId: product!.id, name: "Expired SKU", price: 100, fulfillmentSource: "LOCAL", deliveryType: "MANUAL", status: "INACTIVE", physicalStock: 0, minBuy: 1, maxBuy: 1, createdAt: new Date(now), updatedAt: new Date(now) }).returning();
      const [createdOrder] = await db.insert(order).values({ orderNo: "EXPIRED-1", productId: product!.id, productSkuId: sku!.id, productNameSnapshot: "Expired product", productSkuNameSnapshot: "Expired SKU", unitPrice: 100, quantity: 1, amount: 100, contactType: "EMAIL", paymentProvider: "ALIPAY", fulfillmentSourceSnapshot: "LOCAL", deliveryTypeSnapshot: "MANUAL", status: "CLOSED", paymentStatus: "UNPAID", deliveryStatus: "NOT_DELIVERED", createdAt: new Date(now), updatedAt: new Date(now) }).returning();

      await db.update(order).set({ productId: null, productSkuId: null, updatedAt: new Date(now) }).where(and(eq(order.id, createdOrder!.id), eq(order.status, "CLOSED"), eq(order.paymentStatus, "UNPAID")));
      await db.delete(productSku).where(eq(productSku.id, sku!.id));
      await db.delete(productV2).where(eq(productV2.id, product!.id));

      expect(await db.select({ id: productV2.id }).from(productV2).where(eq(productV2.id, product!.id))).toHaveLength(0);
      expect(await db.select({ productId: order.productId, productSkuId: order.productSkuId, productName: order.productNameSnapshot }).from(order).where(eq(order.id, createdOrder!.id))).toEqual([{ productId: null, productSkuId: null, productName: "Expired product" }]);
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toHaveLength(0);
    } finally {
      close();
    }
  });
});
