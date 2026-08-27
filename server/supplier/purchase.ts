import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order, productSku, supplierAccount, supplierBinding, supplierOrder } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";

export async function createSupplierOrder(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [existing] = await db.select({ id: supplierOrder.id, state: supplierOrder.state }).from(supplierOrder).where(eq(supplierOrder.orderId, orderId)).limit(1);
  if (existing) return { created: false, id: existing.id, state: existing.state };

  const [record] = await db.select({
    id: order.id,
    productSkuId: order.productSkuId,
    quantity: order.quantity,
    paymentStatus: order.paymentStatus,
    fulfillmentSource: order.fulfillmentSourceSnapshot,
  }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "PAID" || record.fulfillmentSource !== "SUPPLIER") return null;
  if (record.productSkuId === null) return null;

  const [binding] = await db.select({
    id: supplierBinding.id,
    provider: supplierBinding.provider,
    normalizedApiOrigin: supplierBinding.normalizedApiOrigin,
    protocolVersion: supplierBinding.protocolVersion,
    upstreamProductId: supplierBinding.upstreamProductId,
    upstreamSkuId: supplierBinding.upstreamSkuId,
    upstreamProductName: supplierBinding.upstreamProductName,
    upstreamSkuName: supplierBinding.upstreamSkuName,
    referenceCostMinor: supplierBinding.referenceCostMinor,
    maxCostMinor: supplierBinding.maxCostMinor,
    purchaseContextJson: supplierBinding.purchaseContextJson,
    currency: supplierAccount.currency,
  }).from(supplierBinding).innerJoin(productSku, eq(productSku.id, supplierBinding.productSkuId)).innerJoin(supplierAccount, and(eq(supplierAccount.provider, supplierBinding.provider), eq(supplierAccount.normalizedApiOrigin, supplierBinding.normalizedApiOrigin), eq(supplierAccount.protocolVersion, supplierBinding.protocolVersion), eq(supplierAccount.enabled, true))).where(and(eq(supplierBinding.productSkuId, record.productSkuId), eq(supplierBinding.enabled, true))).limit(1);
  if (!binding) return null;

  const now = new Date();
  const [created] = await db.insert(supplierOrder).values({
    orderId,
    productSkuId: record.productSkuId,
    supplierBindingId: binding.id,
    quantity: record.quantity,
    quotedUnitCostMinor: binding.referenceCostMinor,
    totalCostMinor: (BigInt(binding.referenceCostMinor) * BigInt(record.quantity)).toString(),
    currency: binding.currency,
    bindingSnapshotJson: JSON.stringify({ provider: binding.provider, normalizedApiOrigin: binding.normalizedApiOrigin, protocolVersion: binding.protocolVersion, upstreamProductId: binding.upstreamProductId, upstreamSkuId: binding.upstreamSkuId, upstreamProductName: binding.upstreamProductName, upstreamSkuName: binding.upstreamSkuName, purchaseContextJson: binding.purchaseContextJson, referenceCostMinor: binding.referenceCostMinor, maxCostMinor: binding.maxCostMinor }),
    state: "pending",
    createdAt: now,
    updatedAt: now,
  }).returning({ id: supplierOrder.id, state: supplierOrder.state });
  if (created) return { created: true, id: created.id, state: created.state };

  const [race] = await db.select({ id: supplierOrder.id, state: supplierOrder.state }).from(supplierOrder).where(eq(supplierOrder.orderId, orderId)).limit(1);
  return race ? { created: false, id: race.id, state: race.state } : appError("SUPPLIER_ORDER_CREATE_FAILED");
}
