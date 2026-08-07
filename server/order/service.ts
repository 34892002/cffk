import { and, eq, lt } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { discountCode, order, orderDelivery, product } from "@/database/drizzle/schema";
import { finalizeReservedCards, getCardsForOrderDelivery, releaseReservedCards, reserveCardsForOrder } from "@/server/inventory/allocator";
import { canConfirmPayment } from "../../lib/order-state";

type ContactType = "EMAIL" | "QQ" | "TELEGRAM" | "OTHER";
type PaymentProvider = "ALIPAY" | "EPAY" | "BEPUSDT" | "STRIPE" | "HASHPAY";


export type CreateOrderInput = {
  productId: number;
  quantity: number;
  paymentProvider: PaymentProvider;
  paymentChannel?: string;
  contactType: ContactType;
  contactValue?: string;
  buyerNote?: string;
  receiverInfo?: string;
  discountCode?: string;
  allowPendingPayment?: boolean;
};

export type CreatedOrder = {
  id: number;
  orderNo: string;
  queryToken: string;
  amount: number;
  originalAmount: number | null;
  discountAmount: number | null;
  discountCode: string | null;
  paymentStatus: "UNPAID" | "PAID";
};

export class OrderCreationError extends Error {}

function fail(code: string): never {
  throw new OrderCreationError(code);
}

function positiveInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value < 1) fail(`${field}_INVALID`);
  return Math.floor(value);
}

function calculateDiscount(type: "FIXED" | "PERCENT", value: number, amount: number) {
  return type === "FIXED" ? Math.min(value, amount) : Math.floor(amount * value / 100);
}

function normalizePaymentChannel(provider: PaymentProvider, channel?: string) {
  const normalized = channel?.trim() || null;
  if (provider === "ALIPAY") return normalized ?? "web";
  if (provider === "EPAY") return normalized === "wxpay" ? "wxpay" : "alipay";
  return normalized;
}

function generateOrderNo() {
  return `ORD${Date.now()}${crypto.randomUUID().slice(0, 8).replace(/-/g, "")}`;
}

function generateQueryToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function reservePhysicalStock(database: D1Database, productId: number, quantity: number) {
  const result = await database
    .prepare("UPDATE product SET physicalStock = physicalStock - ?, updatedAt = ? WHERE id = ? AND physicalStock >= ?")
    .bind(quantity, Date.now(), productId, quantity)
    .run();
  return result.meta.changes === 1;
}

async function restorePhysicalStock(database: D1Database, productId: number, quantity: number) {
  await database
    .prepare("UPDATE product SET physicalStock = physicalStock + ?, updatedAt = ? WHERE id = ?")
    .bind(quantity, Date.now(), productId)
    .run();
}

async function reserveDiscount(database: D1Database, id: number) {
  const result = await database
    .prepare("UPDATE discountCode SET reservedCount = reservedCount + 1, updatedAt = ? WHERE id = ? AND isActive = 1 AND (maxUses IS NULL OR usedCount + reservedCount < maxUses)")
    .bind(Date.now(), id)
    .run();
  return result.meta.changes === 1;
}

async function releaseDiscount(database: D1Database, id: number) {
  await database
    .prepare("UPDATE discountCode SET reservedCount = CASE WHEN reservedCount > 0 THEN reservedCount - 1 ELSE 0 END, updatedAt = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

async function consumeDiscount(database: D1Database, id: number) {
  const result = await database
    .prepare("UPDATE discountCode SET reservedCount = CASE WHEN reservedCount > 0 THEN reservedCount - 1 ELSE 0 END, usedCount = usedCount + 1, updatedAt = ? WHERE id = ? AND (maxUses IS NULL OR usedCount < maxUses)")
    .bind(Date.now(), id)
    .run();
  if (result.meta.changes !== 1) fail("DISCOUNT_CODE_EXHAUSTED");
}

function discountAllowsProduct(productIds: string | null, productId: number) {
  if (!productIds?.trim()) return true;
  const allowed = productIds.split(",").map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isInteger);
  return allowed.length === 0 || allowed.includes(productId);
}

export async function createOrder(database: D1Database, input: CreateOrderInput): Promise<CreatedOrder> {
  const db = createDrizzleDb(database);
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  const requestedQuantity = positiveInteger(input.quantity, "QUANTITY");
  const contactValue = input.contactValue?.trim() || null;
  const receiverInfo = input.receiverInfo?.trim() || null;
  const [item] = await db.select().from(product).where(and(eq(product.id, productId), eq(product.status, "ACTIVE"))).limit(1);
  if (!item) fail("PRODUCT_NOT_AVAILABLE");

  const quantity = Math.max(item.minBuy, Math.min(item.maxBuy, requestedQuantity));
  if (item.deliveryType === "FIXED_CARD" && !item.fixedDeliveryContent?.trim()) fail("PRODUCT_FIXED_CONTENT_MISSING");
  if (item.deliveryType === "EXPRESS" && !receiverInfo) fail("RECEIVER_INFO_REQUIRED");
  if (item.isContactRequired && !contactValue) fail("CONTACT_VALUE_REQUIRED");

  const originalAmount = item.price * quantity;
  let discountId: number | null = null;
  let discountCodeValue: string | null = null;
  let discountAmount = 0;

  if (input.discountCode?.trim()) {
    const code = input.discountCode.trim().toUpperCase();
    const [candidate] = await db.select().from(discountCode).where(eq(discountCode.code, code)).limit(1);
    if (!candidate) fail("DISCOUNT_CODE_NOT_FOUND");
    if (!candidate.isActive) fail("DISCOUNT_CODE_DISABLED");
    if (candidate.expiresAt && candidate.expiresAt.getTime() <= Date.now()) fail("DISCOUNT_CODE_EXPIRED");
    if (candidate.minAmount !== null && originalAmount < candidate.minAmount) fail("DISCOUNT_CODE_MIN_AMOUNT");
    if (!discountAllowsProduct(candidate.productIds, item.id)) fail("DISCOUNT_CODE_PRODUCT_NOT_ALLOWED");
    if (!(await reserveDiscount(database, candidate.id))) fail("DISCOUNT_CODE_EXHAUSTED");
    discountId = candidate.id;
    discountCodeValue = candidate.code;
    discountAmount = calculateDiscount(candidate.type, candidate.value, originalAmount);
  }

  const reservePhysical = (item.deliveryType === "MANUAL" || item.deliveryType === "EXPRESS") && item.physicalStock !== null;
  let physicalStockReserved = false;
  let createdOrderId: number | null = null;

  try {
    if (reservePhysical) {
      physicalStockReserved = await reservePhysicalStock(database, item.id, quantity);
      if (!physicalStockReserved) fail("PRODUCT_STOCK_NOT_ENOUGH");
    }

    const now = new Date();
    const amount = Math.max(0, originalAmount - discountAmount);
    if (amount > 0 && input.allowPendingPayment === false) fail("PAYMENT_ADAPTER_NOT_AVAILABLE");

    const orderNo = generateOrderNo();
    const queryToken = generateQueryToken();
    const [created] = await db.insert(order).values({
      orderNo,
      queryToken,
      productId: item.id,
      productNameSnapshot: item.name,
      unitPrice: item.price,
      quantity,
      amount,
      contactType: input.contactType,
      contactValue,
      buyerNote: input.buyerNote?.trim() || null,
      receiverInfo,
      paymentProvider: input.paymentProvider,
      paymentChannel: normalizePaymentChannel(input.paymentProvider, input.paymentChannel),
      discountCodeId: discountId,
      discountCodeStr: discountCodeValue,
      originalAmount: discountId === null ? null : originalAmount,
      discountAmount: discountId === null ? null : discountAmount,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: order.id });
    if (!created) fail("ORDER_CREATE_FAILED");
    createdOrderId = created.id;

    if (item.deliveryType === "CARD_AUTO") {
      await reserveCardsForOrder(database, created.id, item.id, quantity);
    }

    if (amount === 0) {
      await markOrderPaid(database, created.id);
    }

    return {
      id: created.id,
      orderNo,
      queryToken,
      amount,
      originalAmount: discountId === null ? null : originalAmount,
      discountAmount: discountId === null ? null : discountAmount,
      discountCode: discountCodeValue,
      paymentStatus: amount === 0 ? "PAID" : "UNPAID",
    };
  } catch (error) {
    if (createdOrderId !== null) {
      await releaseReservedCards(database, createdOrderId).catch(() => undefined);
      await db.update(order).set({ status: "CLOSED", closedAt: new Date(), updatedAt: new Date() }).where(eq(order.id, createdOrderId)).catch(() => undefined);
    }
    if (physicalStockReserved) await restorePhysicalStock(database, item.id, quantity).catch(() => undefined);
    if (discountId !== null) await releaseDiscount(database, discountId).catch(() => undefined);
    throw error;
  }
}

export async function markOrderPaid(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [record] = await db.select({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, discountCodeId: order.discountCodeId }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus === "PAID") {
    await deliverPaidOrder(database, orderId);
    return "ALREADY_PAID" as const;
  }
  if (!canConfirmPayment(record.status, record.paymentStatus)) return "NOT_PAYABLE" as const;

  const result = await db
    .update(order)
    .set({ status: "PAID", paymentStatus: "PAID", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(order.id, orderId), eq(order.status, "PENDING"), eq(order.paymentStatus, "UNPAID")))
    .returning({ id: order.id });
  if (!result[0]) return "NOT_PAYABLE" as const;

  if (record.discountCodeId !== null) await consumeDiscount(database, record.discountCodeId);
  await deliverPaidOrder(database, orderId);
  return "CONFIRMED" as const;
}

export async function deliverPaidOrder(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [record] = await db
    .select({
      id: order.id,
      productId: order.productId,
      quantity: order.quantity,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      deliveryType: product.deliveryType,
      fixedDeliveryContent: product.fixedDeliveryContent,
    })
    .from(order)
    .innerJoin(product, eq(order.productId, product.id))
    .where(eq(order.id, orderId))
    .limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "PAID") fail("ORDER_NOT_PAID");
  if (record.deliveryStatus === "DELIVERED") return;

  // Manual and express orders remain paid until an administrator records delivery.
  if (record.deliveryType === "MANUAL" || record.deliveryType === "EXPRESS") return;

  let deliveryType: "CARD" | "FIXED_CARD";
  let contents: string[];
  if (record.deliveryType === "FIXED_CARD") {
    const content = record.fixedDeliveryContent?.trim();
    if (!content) fail("FIXED_DELIVERY_CONTENT_MISSING");
    deliveryType = "FIXED_CARD";
    contents = [content];
  } else {
    const cards = await getCardsForOrderDelivery(database, orderId);
    if (cards.length !== record.quantity) fail("CARD_DELIVERY_COUNT_MISMATCH");
    deliveryType = "CARD";
    contents = cards.map((item) => item.content);
  }

  const now = new Date();
  await db.insert(orderDelivery).values({
    orderId,
    deliveryType,
    contentSnapshot: JSON.stringify(contents),
    status: "SUCCESS",
    createdAt: now,
  }).onConflictDoNothing();

  if (record.deliveryType === "CARD_AUTO") await finalizeReservedCards(database, orderId);
  await db.update(order).set({ status: "DELIVERED", deliveryStatus: "DELIVERED", deliveredAt: now, updatedAt: now }).where(eq(order.id, orderId));
}

export type QueriedOrder = {
  orderNo: string;
  status: "PENDING" | "PAID" | "DELIVERED" | "CLOSED" | "FAILED";
  paymentStatus: "UNPAID" | "PAID" | "FAILED";
  deliveryStatus: "NOT_DELIVERED" | "DELIVERED" | "FAILED";
  productName: string;
  quantity: number;
  amount: number;
  createdAt: Date;
  deliveries: string[];
};

export async function getOrderForQuery(database: D1Database, orderNo: string, queryToken: string): Promise<QueriedOrder | null> {
  const normalizedOrderNo = orderNo.trim();
  const normalizedQueryToken = queryToken.trim();
  if (!normalizedOrderNo || !normalizedQueryToken) return null;

  const db = createDrizzleDb(database);
  const [record] = await db
    .select({
      id: order.id,
      orderNo: order.orderNo,
      queryToken: order.queryToken,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      productName: order.productNameSnapshot,
      quantity: order.quantity,
      amount: order.amount,
      createdAt: order.createdAt,
    })
    .from(order)
    .where(eq(order.orderNo, normalizedOrderNo))
    .limit(1);
  if (!record || record.queryToken !== normalizedQueryToken) return null;

  const deliveries = await db
    .select({ contentSnapshot: orderDelivery.contentSnapshot })
    .from(orderDelivery)
    .where(and(eq(orderDelivery.orderId, record.id), eq(orderDelivery.status, "SUCCESS")));

  return {
    orderNo: record.orderNo,
    status: record.status,
    paymentStatus: record.paymentStatus,
    deliveryStatus: record.deliveryStatus,
    productName: record.productName,
    quantity: record.quantity,
    amount: record.amount,
    createdAt: record.createdAt,
    deliveries: deliveries.flatMap((item) => {
      try {
        const parsed = JSON.parse(item.contentSnapshot) as unknown;
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [item.contentSnapshot];
      } catch {
        return [item.contentSnapshot];
      }
    }),
  };
}

export async function closeExpiredPendingOrders(database: D1Database, cutoff: Date, limit = 100) {
  const db = createDrizzleDb(database);
  const records = await db
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.status, "PENDING"), eq(order.paymentStatus, "UNPAID"), lt(order.createdAt, cutoff)))
    .limit(limit);

  for (const record of records) await closePendingOrder(database, record.id);
  return records.length;
}

export async function closePendingOrder(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [record] = await db
    .select({ id: order.id, productId: order.productId, quantity: order.quantity, paymentStatus: order.paymentStatus, status: order.status, discountCodeId: order.discountCodeId, deliveryType: product.deliveryType, physicalStock: product.physicalStock })
    .from(order)
    .innerJoin(product, eq(order.productId, product.id))
    .where(eq(order.id, orderId))
    .limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "UNPAID" || record.status !== "PENDING") return;

  const result = await db.update(order).set({ status: "CLOSED", closedAt: new Date(), updatedAt: new Date() }).where(and(eq(order.id, orderId), eq(order.status, "PENDING"), eq(order.paymentStatus, "UNPAID"))).returning({ id: order.id });
  if (!result[0]) return;

  await releaseReservedCards(database, orderId);
  if ((record.deliveryType === "MANUAL" || record.deliveryType === "EXPRESS") && record.physicalStock !== null) {
    await restorePhysicalStock(database, record.productId, record.quantity);
  }
  if (record.discountCodeId !== null) await releaseDiscount(database, record.discountCodeId);
}
