// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { createDrizzleDb } from "../../database/drizzle";
import { category, order, productSku, productV2, supplierAccount, supplierBinding } from "../../database/drizzle/schema";
import { importSupplierProduct } from "../../server/supplier/import";
import { assertSupplierSkuPublishable } from "../../server/supplier/eligibility";
import { getPublicProductDetail } from "../../server/catalog/public";
import { createOrder } from "../../server/order/service";
import { createTestDatabase } from "../helpers/sqlite-d1";

const source = {
  provider: "acg" as const,
  normalizedApiOrigin: "https://supplier.example",
  protocolVersion: "acg_v3.1.2_plus",
};

const catalogProduct = {
  id: "product-1",
  name: "Supplier product",
  description: "Imported product",
  active: true,
  categoryNames: [],
  imageUrls: [],
  skus: [{ id: "sku-1", name: "Supplier SKU", costMinor: "100", stockQuantity: 5, active: true }],
};

async function createDefaultCategory(db: ReturnType<typeof createDrizzleDb>, now: Date) {
  await db.insert(category).values({
    name: "Default",
    slug: "default",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });
}

function mockSupplierPublicationRefresh(balance: string, stock: number) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    const data = path.endsWith("/authentication/connect")
      ? { username: "ACG", balance }
      : path.endsWith("/commodity/item")
        ? { code: "sku-1", name: "Supplier SKU", factory_price: "1", stock, status: 1 }
        : path.endsWith("/commodity/valuation")
          ? { price: "1.00" }
          : { stock };
    return new Response(JSON.stringify({ code: 200, data }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return () => { globalThis.fetch = originalFetch; };
}

describe("supplier import", () => {
  test("imports supplier SKUs as a draft with explicit fulfillment", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      await createDefaultCategory(db, now);
      await db.insert(supplierAccount).values({
        id: "account-1",
        ...source,
        baseUrl: source.normalizedApiOrigin,
        name: "Primary account",
        credentialsJson: "{}",
        enabled: true,
        balanceMinor: "1000",
        healthStatus: "healthy",
        createdAt: now,
        updatedAt: now,
      });

      const result = await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "10", markupBps: 0, publish: false }, catalogProduct);
      const [product] = await db.select().from(productV2);
      const [sku] = await db.select().from(productSku);
      const [binding] = await db.select().from(supplierBinding);

      expect(result).toMatchObject({ productId: product?.id, imported: 1 });
      expect(product).toMatchObject({ status: "DRAFT", categoryId: 1 });
      expect(sku).toMatchObject({ fulfillmentSource: "SUPPLIER", deliveryType: "SUPPLIER", status: "INACTIVE", physicalStock: null });
      expect(binding).toMatchObject({ productSkuId: sku?.id, upstreamProductId: "product-1", upstreamSkuId: "sku-1", remoteStatus: "active", referenceCostMinor: "100", maxCostMinor: "110" });
    } finally {
      close();
    }
  });

  test("allows a healthy bound SKU to pass publication eligibility", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      await createDefaultCategory(db, now);
      await db.insert(supplierAccount).values({ id: "account-1", ...source, baseUrl: source.normalizedApiOrigin, name: "Primary account", credentialsJson: '{"apiId":"test","appKey":"test"}', enabled: true, balanceMinor: "0", healthStatus: "healthy", createdAt: now, updatedAt: now });
      await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "0", markupBps: 0, publish: false }, catalogProduct);
      const [sku] = await db.select().from(productSku);
      const restoreFetch = mockSupplierPublicationRefresh("10.00", 5);

      await expect(assertSupplierSkuPublishable(db, sku!.id)).resolves.toMatchObject({ binding: { stockQuantity: 5 }, account: { id: "account-1", balanceMinor: "1000" } });
      restoreFetch();
    } finally {
      close();
    }
  });

  test("rejects publication when the upstream SKU is out of stock", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      await createDefaultCategory(db, now);
      await db.insert(supplierAccount).values({ id: "account-1", ...source, baseUrl: source.normalizedApiOrigin, name: "Primary account", credentialsJson: '{"apiId":"test","appKey":"test"}', enabled: true, balanceMinor: "1000", healthStatus: "healthy", createdAt: now, updatedAt: now });
      await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "0", markupBps: 0, publish: false }, catalogProduct);
      const [sku] = await db.select().from(productSku);
      const restoreFetch = mockSupplierPublicationRefresh("10.00", 0);

      await expect(assertSupplierSkuPublishable(db, sku!.id)).rejects.toMatchObject({ code: "SUPPLIER_STOCK_NOT_ENOUGH" });
      restoreFetch();
    } finally {
      close();
    }
  });

  test("publishes supplier products without local stock limits and creates supplier orders", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      await createDefaultCategory(db, now);
      await db.insert(supplierAccount).values({ id: "account-1", ...source, baseUrl: source.normalizedApiOrigin, name: "Primary account", credentialsJson: '{"apiId":"test","appKey":"test"}', enabled: true, balanceMinor: "1000", healthStatus: "healthy", createdAt: now, updatedAt: now });
      await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "10", markupBps: 0, publish: false }, catalogProduct);
      const [item] = await db.select().from(productV2);
      const [sku] = await db.select().from(productSku);
      await db.update(productV2).set({ status: "ACTIVE", updatedAt: now }).where(eq(productV2.id, item!.id));
      await db.update(productSku).set({ status: "ACTIVE", updatedAt: now }).where(eq(productSku.id, sku!.id));

      const detail = await getPublicProductDetail(database, item!.slug);
      expect(detail?.skus[0]).toMatchObject({ id: sku!.id, deliveryType: "SUPPLIER", availableStock: null });
      const restoreFetch = mockSupplierPublicationRefresh("10.00", 5);
      const created = await createOrder(database, { productId: item!.id, productSkuId: sku!.id, quantity: 1, paymentProvider: "ALIPAY", contactType: "EMAIL", contactValue: "buyer@example.com", allowPendingPayment: true }, null);
      restoreFetch();
      const [savedOrder] = await db.select().from(order).where(eq(order.id, created.id));
      expect(savedOrder).toMatchObject({ fulfillmentSourceSnapshot: "SUPPLIER", deliveryTypeSnapshot: "SUPPLIER", quantity: 1, paymentStatus: "UNPAID" });
    } finally {
      close();
    }
  });

  test("re-import refreshes the existing supplier SKU without changing its local identity", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      await createDefaultCategory(db, now);
      await db.insert(supplierAccount).values({ id: "account-1", ...source, baseUrl: source.normalizedApiOrigin, name: "Primary account", credentialsJson: "{}", enabled: true, balanceMinor: "1000", healthStatus: "healthy", createdAt: now, updatedAt: now });
      await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "10", markupBps: 0, publish: false }, catalogProduct);
      const [beforeSku] = await db.select().from(productSku);
      const [beforeBinding] = await db.select().from(supplierBinding);
      const updatedCatalog = { ...catalogProduct, name: "Supplier product updated", skus: [{ ...catalogProduct.skus[0]!, name: "Updated SKU", costMinor: "200", stockQuantity: 8 }] };
      const result = await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "20", markupBps: 0, publish: false }, updatedCatalog);
      const [afterSku] = await db.select().from(productSku);
      const [afterBinding] = await db.select().from(supplierBinding);
      expect(result).toMatchObject({ productId: beforeSku?.productId, imported: 1 });
      expect(afterSku).toMatchObject({ id: beforeSku?.id, price: 220, name: "Updated SKU" });
      expect(afterBinding).toMatchObject({ id: beforeBinding?.id, productSkuId: beforeSku?.id, referenceCostMinor: "200", maxCostMinor: "220", stockQuantity: 8, upstreamProductName: "Supplier product updated" });
    } finally {
      close();
    }
  });

  test("imports multiple upstream SKUs into one local product", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      const now = new Date();
      await createDefaultCategory(db, now);
      await db.insert(supplierAccount).values({ id: "account-1", ...source, baseUrl: source.normalizedApiOrigin, name: "Primary account", credentialsJson: "{}", enabled: true, balanceMinor: "1000", healthStatus: "healthy", createdAt: now, updatedAt: now });
      const threeSkuProduct = { ...catalogProduct, name: "哈喽", skus: [
        { id: "月费", name: "哈喽 · 月费", costMinor: "2000", stockQuantity: 123, active: true, purchaseContext: { code: "product-1", race: "月费" } },
        { id: "季费", name: "哈喽 · 季费", costMinor: "7000", stockQuantity: 123, active: true, purchaseContext: { code: "product-1", race: "季费" } },
        { id: "年费", name: "哈喽 · 年费", costMinor: "15000", stockQuantity: 123, active: true, purchaseContext: { code: "product-1", race: "年费" } },
      ] };
      const result = await importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["月费", "季费", "年费"], fixedMarkupMinor: "100", markupBps: 0, publish: false }, threeSkuProduct);
      const localProducts = await db.select().from(productV2);
      const localSkus = await db.select().from(productSku);
      const bindings = await db.select().from(supplierBinding);
      expect(result).toMatchObject({ imported: 3 });
      expect(localProducts).toHaveLength(1);
      expect(localSkus.map((sku) => [sku.productId, sku.name, sku.price])).toEqual([[localProducts[0]!.id, "哈喽 · 月费", 2100], [localProducts[0]!.id, "哈喽 · 季费", 7100], [localProducts[0]!.id, "哈喽 · 年费", 15100]]);
      expect(bindings.map((binding) => [binding.productSkuId, binding.upstreamSkuId])).toEqual([[localSkus[0]!.id, "月费"], [localSkus[1]!.id, "季费"], [localSkus[2]!.id, "年费"]]);
    } finally {
      close();
    }
  });

  test("rejects an import when the supplier source has no enabled account", async () => {
    const { database, close } = createTestDatabase();
    try {
      const db = createDrizzleDb(database);
      await expect(importSupplierProduct(db, { ...source, productId: "product-1", skuIds: ["sku-1"], fixedMarkupMinor: "0", markupBps: 0, publish: false }, catalogProduct)).rejects.toMatchObject({ code: "SUPPLIER_SOURCE_NO_ACCOUNT" });
      expect(await db.select().from(productV2)).toHaveLength(0);
    } finally {
      close();
    }
  });
});
