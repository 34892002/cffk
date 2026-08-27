// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDrizzleDb } from "../../database/drizzle";
import { productSku, productV2, supplierBinding } from "../../database/drizzle/schema";
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
});
