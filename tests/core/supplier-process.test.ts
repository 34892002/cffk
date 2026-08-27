// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { createDrizzleDb } from "../../database/drizzle";
import { eq } from "drizzle-orm";
import { order, orderDelivery, orderEvent, supplierOrder } from "../../database/drizzle/schema";
import { completeSupplierOrderFromCallback, processSupplierOrder } from "../../server/supplier/process";
import { createTestDatabase } from "../helpers/sqlite-d1";

describe("supplier fulfillment", () => {
  test("callback fulfillment is idempotent and stores the delivery record", async () => {
    const { database, sqlite, close } = createTestDatabase();
    try {
      const now = Date.now();
      sqlite.query("INSERT INTO product_v2 (id, categoryId, name, slug, status, sort, createdAt, updatedAt) VALUES (1, NULL, 'Supplier product', 'supplier-product', 'ACTIVE', 0, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO productSku (id, productId, name, price, status, fulfillmentSource, deliveryType, physicalStock, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (1, 1, 'SKU', 100, 'ACTIVE', 'SUPPLIER', 'SUPPLIER', NULL, 1, 10, 0, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO `order` (id, orderNo, productId, productSkuId, productNameSnapshot, productSkuNameSnapshot, unitPrice, quantity, amount, contactType, paymentProvider, fulfillmentSourceSnapshot, deliveryTypeSnapshot, status, paymentStatus, deliveryStatus, createdAt, updatedAt) VALUES (1, 'ORDER-1', 1, 1, 'Supplier product', 'SKU', 100, 1, 100, 'EMAIL', 'TEST', 'SUPPLIER', 'SUPPLIER', 'PAID', 'PAID', 'NOT_DELIVERED', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierAccount (id, provider, baseUrl, normalizedApiOrigin, protocolVersion, name, credentialsJson, createdAt, updatedAt) VALUES ('account-1', 'dujiao_next', 'https://supplier.example', 'https://supplier.example', '1.3.1-upstream-v1', 'Account', '{}', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierBinding (id, productSkuId, provider, normalizedApiOrigin, protocolVersion, upstreamProductId, upstreamSkuId, upstreamProductName, upstreamSkuName, referenceCostMinor, maxCostMinor, remoteStatus, createdAt, updatedAt) VALUES (1, 1, 'dujiao_next', 'https://supplier.example', '1.3.1-upstream-v1', 'product-1', 'sku-1', 'Supplier product', 'SKU', '10', '20', 'active', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierOrder (id, orderId, productSkuId, supplierBindingId, selectedAccountId, providerRequestNo, upstreamOrderId, quantity, bindingSnapshotJson, state, createdAt, updatedAt) VALUES (1, 1, 1, 1, 'account-1', 'request-1', NULL, 1, '{\"upstreamSkuId\":\"sku-1\"}', 'processing', ?, ?)").run(now, now);

      const first = await completeSupplierOrderFromCallback(database, 1, "upstream-1", ["CARD-1"]);
      const second = await completeSupplierOrderFromCallback(database, 1, "upstream-1", ["CARD-1"]);
      const db = createDrizzleDb(database);
      const [task] = await db.select({ state: supplierOrder.state, deliveryRecordId: supplierOrder.deliveryRecordId }).from(supplierOrder).where(eq(supplierOrder.id, 1));
      const deliveries = await db.select({ id: orderDelivery.id, content: orderDelivery.contentSnapshot }).from(orderDelivery);
      const [localOrder] = await db.select({ status: order.status, deliveryStatus: order.deliveryStatus }).from(order);
      const events = await db.select({ eventKey: orderEvent.eventKey, scene: orderEvent.scene, status: orderEvent.status }).from(orderEvent);

      expect(first).toEqual({ status: "supplied", duplicate: false });
      expect(second).toEqual({ status: "supplied", duplicate: true });
      expect(task?.state).toBe("supplied");
      expect(task?.deliveryRecordId).toBe(deliveries[0]?.id);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.content).toBe(JSON.stringify(["CARD-1"]));
      expect(localOrder).toEqual({ status: "DELIVERED", deliveryStatus: "DELIVERED" });
      expect(events).toEqual([{ eventKey: "delivery-success:supplier:1", scene: "DELIVERY_SUCCESS", status: "PENDING" }]);
    } finally {
      close();
    }
  });

  test("callback rejects a supplier task attached to a local order", async () => {
    const { database, sqlite, close } = createTestDatabase();
    try {
      const now = Date.now();
      sqlite.query("INSERT INTO product_v2 (id, categoryId, name, slug, status, sort, createdAt, updatedAt) VALUES (1, NULL, 'Local product', 'local-product', 'ACTIVE', 0, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO productSku (id, productId, name, price, status, fulfillmentSource, deliveryType, physicalStock, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (1, 1, 'SKU', 100, 'ACTIVE', 'LOCAL', 'MANUAL', 1, 1, 10, 0, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO `order` (id, orderNo, productId, productSkuId, productNameSnapshot, productSkuNameSnapshot, unitPrice, quantity, amount, contactType, paymentProvider, fulfillmentSourceSnapshot, deliveryTypeSnapshot, status, paymentStatus, deliveryStatus, createdAt, updatedAt) VALUES (1, 'ORDER-1', 1, 1, 'Local product', 'SKU', 100, 1, 100, 'EMAIL', 'TEST', 'LOCAL', 'MANUAL', 'PAID', 'PAID', 'NOT_DELIVERED', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierAccount (id, provider, baseUrl, normalizedApiOrigin, protocolVersion, name, credentialsJson, createdAt, updatedAt) VALUES ('account-1', 'dujiao_next', 'https://supplier.example', 'https://supplier.example', '1.3.1-upstream-v1', 'Account', '{}', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierBinding (id, productSkuId, provider, normalizedApiOrigin, protocolVersion, upstreamProductId, upstreamSkuId, upstreamProductName, upstreamSkuName, referenceCostMinor, maxCostMinor, remoteStatus, createdAt, updatedAt) VALUES (1, 1, 'dujiao_next', 'https://supplier.example', '1.3.1-upstream-v1', 'product-1', 'sku-1', 'Local product', 'SKU', '10', '20', 'active', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierOrder (id, orderId, productSkuId, supplierBindingId, selectedAccountId, quantity, bindingSnapshotJson, state, createdAt, updatedAt) VALUES (1, 1, 1, 1, 'account-1', 1, '{\"upstreamSkuId\":\"sku-1\"}', 'processing', ?, ?)").run(now, now);

      await expect(completeSupplierOrderFromCallback(database, 1, "upstream-1", ["CARD-1"])).rejects.toThrow("supplier_order_fulfillment_invalid");
      const localOrder = sqlite.query("SELECT status, deliveryStatus FROM `order` WHERE id = 1").get();
      expect(localOrder).toMatchObject({ status: "PAID", deliveryStatus: "NOT_DELIVERED" });
    } finally {
      close();
    }
  });

  test("invalid binding snapshots become terminal failures", async () => {
    const { database, sqlite, close } = createTestDatabase();
    try {
      const now = Date.now();
      sqlite.query("INSERT INTO product_v2 (id, categoryId, name, slug, status, sort, createdAt, updatedAt) VALUES (1, NULL, 'Supplier product', 'supplier-product', 'ACTIVE', 0, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO productSku (id, productId, name, price, status, fulfillmentSource, deliveryType, physicalStock, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (1, 1, 'SKU', 100, 'ACTIVE', 'SUPPLIER', 'SUPPLIER', NULL, 1, 10, 0, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO `order` (id, orderNo, productId, productSkuId, productNameSnapshot, productSkuNameSnapshot, unitPrice, quantity, amount, contactType, paymentProvider, fulfillmentSourceSnapshot, deliveryTypeSnapshot, status, paymentStatus, deliveryStatus, createdAt, updatedAt) VALUES (1, 'ORDER-1', 1, 1, 'Supplier product', 'SKU', 100, 1, 100, 'EMAIL', 'TEST', 'SUPPLIER', 'SUPPLIER', 'PAID', 'PAID', 'NOT_DELIVERED', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierAccount (id, provider, baseUrl, normalizedApiOrigin, protocolVersion, name, credentialsJson, enabled, createdAt, updatedAt) VALUES ('account-1', 'dujiao_next', 'https://supplier.example', 'https://supplier.example', '1.3.1-upstream-v1', 'Account', '{\"apiKey\":\"key\",\"apiSecret\":\"secret\"}', 1, ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierBinding (id, productSkuId, provider, normalizedApiOrigin, protocolVersion, upstreamProductId, upstreamSkuId, upstreamProductName, upstreamSkuName, referenceCostMinor, maxCostMinor, stockQuantity, remoteStatus, createdAt, updatedAt) VALUES (1, 1, 'dujiao_next', 'https://supplier.example', '1.3.1-upstream-v1', 'product-1', 'sku-1', 'Supplier product', 'SKU', '10', '20', 1, 'active', ?, ?)").run(now, now);
      sqlite.query("INSERT INTO supplierOrder (id, orderId, productSkuId, supplierBindingId, selectedAccountId, upstreamOrderId, quantity, bindingSnapshotJson, state, createdAt, updatedAt) VALUES (1, 1, 1, 1, 'account-1', 'upstream-1', 1, '{\"broken\":true}', 'processing', ?, ?)").run(now, now);

      await expect(processSupplierOrder(database, 1)).resolves.toEqual({ status: "failed", errorCode: "supplier_binding_snapshot_invalid" });
      const task = sqlite.query("SELECT state, nextRetryAt, lastErrorCode FROM supplierOrder WHERE id = 1").get() as { state: string; nextRetryAt: unknown; lastErrorCode: string };
      expect(task).toMatchObject({ state: "failed", nextRetryAt: null, lastErrorCode: "supplier_binding_snapshot_invalid" });
    } finally {
      close();
    }
  });
});
