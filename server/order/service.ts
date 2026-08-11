import { and, asc, eq, lt, or } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { automaticDeliveryJob, order, orderDelivery, product } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { canConfirmPayment } from "@/lib/order-state";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { validateDiscountForItem, positiveInteger } from "@/server/discount/service";
import { allocateCardsForPaidOrder, countAvailableCards } from "@/server/inventory/allocator";
import { PaymentLogService } from "@/server/payment/log-service";
import type { PaymentProviderKind } from "@/server/payment/registry";

const DELIVERY_LEASE_MS = 5 * 60 * 1000;

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

function fail(code: string): never {
  appError(code);
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
  const result = await database.prepare("UPDATE product SET physicalStock = physicalStock - ?, updatedAt = ? WHERE id = ? AND physicalStock >= ?").bind(quantity, Date.now(), productId, quantity).run();
  return result.meta.changes === 1;
}

async function restorePhysicalStock(database: D1Database, productId: number, quantity: number) {
  await database.prepare("UPDATE product SET physicalStock = physicalStock + ?, updatedAt = ? WHERE id = ?").bind(quantity, Date.now(), productId).run();
}

async function reserveDiscount(database: D1Database, id: number) {
  const result = await database.prepare("UPDATE discountCode SET reservedCount = reservedCount + 1, updatedAt = ? WHERE id = ? AND isActive = 1 AND (maxUses IS NULL OR usedCount + reservedCount < maxUses)").bind(Date.now(), id).run();
  return result.meta.changes === 1;
}

async function releaseDiscount(database: D1Database, id: number) {
  await database.prepare("UPDATE discountCode SET reservedCount = CASE WHEN reservedCount > 0 THEN reservedCount - 1 ELSE 0 END, updatedAt = ? WHERE id = ?").bind(Date.now(), id).run();
}

export async function createOrder(database: D1Database, input: CreateOrderInput): Promise<CreatedOrder> {
  const db = createDrizzleDb(database);
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  const requestedQuantity = positiveInteger(input.quantity, "QUANTITY");
  const contactValue = input.contactValue?.trim() || null;
  const receiverInfo = input.receiverInfo?.trim() || null;
  const [item] = await db.select().from(product).where(and(eq(product.id, productId), eq(product.status, "ACTIVE"))).limit(1);
  if (!item) fail("PRODUCT_NOT_AVAILABLE");

  if (item.deliveryType === "FIXED_CARD" && requestedQuantity !== 1) fail("PRODUCT_QUANTITY_INVALID");
  if (requestedQuantity < item.minBuy || requestedQuantity > item.maxBuy) fail("PRODUCT_QUANTITY_INVALID");
  const quantity = item.deliveryType === "FIXED_CARD" ? 1 : requestedQuantity;
  if (item.deliveryType === "CARD_AUTO" && (await countAvailableCards(database, item.id)) < quantity) fail("PRODUCT_STOCK_NOT_ENOUGH");
  if (item.deliveryType === "FIXED_CARD" && !item.fixedDeliveryContent?.trim()) fail("PRODUCT_FIXED_CONTENT_MISSING");
  if (item.deliveryType === "EXPRESS" && !receiverInfo) fail("RECEIVER_INFO_REQUIRED");
  if (!contactValue) fail("CONTACT_VALUE_REQUIRED");

  const originalAmount = item.price * quantity;
  let discountId: number | null = null;
  let discountCodeValue: string | null = null;
  let discountAmount = 0;
  if (input.discountCode?.trim()) {
    const validated = await validateDiscountForItem(db, item, quantity, input.discountCode);
    if (!(await reserveDiscount(database, validated.id))) fail("DISCOUNT_CODE_EXHAUSTED");
    discountId = validated.id;
    discountCodeValue = validated.code;
    discountAmount = validated.discountAmount;
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
      deliveryTypeSnapshot: item.deliveryType,
      fixedDeliveryContentSnapshot: item.deliveryType === "FIXED_CARD" ? item.fixedDeliveryContent!.trim() : null,
      physicalStockReserved,
      discountCodeId: discountId,
      discountCodeStr: discountCodeValue,
      originalAmount: discountId === null ? null : originalAmount,
      discountAmount: discountId === null ? null : discountAmount,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: order.id });
    if (!created) fail("ORDER_CREATE_FAILED");
    createdOrderId = created.id;
    return { id: created.id, orderNo, queryToken, amount, originalAmount: discountId === null ? null : originalAmount, discountAmount: discountId === null ? null : discountAmount, discountCode: discountCodeValue, paymentStatus: "UNPAID" };
  } catch (cause) {
    if (createdOrderId !== null) await db.update(order).set({ status: "CLOSED", closedAt: new Date(), updatedAt: new Date() }).where(eq(order.id, createdOrderId)).catch(() => undefined);
    if (physicalStockReserved) await restorePhysicalStock(database, item.id, quantity).catch(() => undefined);
    if (discountId !== null) await releaseDiscount(database, discountId).catch(() => undefined);
    throw cause;
  }
}

export type PaymentConfirmationResult = {
  outcome: "CONFIRMED" | "ALREADY_PAID" | "PAYMENT_EXCEPTION" | "NOT_PAYABLE" | "DELIVERY_PENDING" | "DELIVERY_FAILED";
  deliveryError?: string;
};

export async function confirmOrderPayment(database: D1Database, orderId: number): Promise<PaymentConfirmationResult> {
  const db = createDrizzleDb(database);
  const [record] = await db.select({ status: order.status, paymentStatus: order.paymentStatus, discountCodeId: order.discountCodeId, deliveryType: order.deliveryTypeSnapshot }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus === "PAID") {
    const delivery = await deliverPaidOrder(database, orderId);
    return { outcome: delivery.status === "FAILED" ? "DELIVERY_FAILED" : "ALREADY_PAID", deliveryError: delivery.errorCode };
  }
  if (record.status === "CLOSED" && record.paymentStatus === "UNPAID") return { outcome: "PAYMENT_EXCEPTION" };
  if (!canConfirmPayment(record.status, record.paymentStatus)) return { outcome: "NOT_PAYABLE" };

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (record.discountCodeId !== null) {
    statements.push(
      database.prepare("UPDATE discountCode SET reservedCount = reservedCount - 1, usedCount = usedCount + 1, updatedAt = ? WHERE id = ? AND reservedCount > 0 AND EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID')").bind(now, record.discountCodeId, orderId),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
    );
  }
  statements.push(
    database.prepare("UPDATE `order` SET status = 'PAID', paymentStatus = 'PAID', paidAt = ?, updatedAt = ? WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID'").bind(now, now, orderId),
    database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
  );
  if (record.deliveryType === "CARD_AUTO" || record.deliveryType === "FIXED_CARD") {
    statements.push(database.prepare("INSERT INTO automaticDeliveryJob (orderId, status, attemptCount, createdAt, updatedAt) SELECT id, 'PENDING', 0, ?, ? FROM `order` WHERE id = ? AND paymentStatus = 'PAID' ON CONFLICT(orderId) DO NOTHING").bind(now, now, orderId));
  }
  statements.push(database.prepare("INSERT INTO orderEvent (eventKey, orderId, scene, status, attemptCount, availableAt, createdAt, updatedAt) SELECT 'order-paid:' || id, id, 'ORDER_PAID', 'PENDING', 0, ?, ?, ? FROM `order` WHERE id = ? AND paymentStatus = 'PAID' ON CONFLICT(eventKey) DO NOTHING").bind(now, now, now, orderId));
  try {
    await database.batch(statements);
  } catch {
    const [current] = await db.select({ paymentStatus: order.paymentStatus }).from(order).where(eq(order.id, orderId)).limit(1);
    if (current?.paymentStatus !== "PAID") return { outcome: "NOT_PAYABLE" };
  }

  const delivery = await deliverPaidOrder(database, orderId);
  if (delivery.status === "FAILED") return { outcome: "DELIVERY_FAILED", deliveryError: delivery.errorCode };
  if (delivery.status === "PENDING") return { outcome: "DELIVERY_PENDING" };
  return { outcome: "CONFIRMED" };
}

export type DeliveryResult = { status: "DELIVERED" | "PENDING" | "FAILED" | "NOT_AUTOMATIC"; errorCode?: string };

async function claimAutomaticDelivery(database: D1Database, orderId: number, token: string, now: Date) {
  const leaseUntil = now.getTime() + DELIVERY_LEASE_MS;
  try {
    await database.batch([
      database.prepare(`UPDATE \`order\` SET deliveryStatus = 'DELIVERING', deliveryToken = ?, deliveryLeaseUntil = ?, updatedAt = ?
        WHERE id = ? AND paymentStatus = 'PAID' AND deliveryTypeSnapshot IN ('CARD_AUTO', 'FIXED_CARD') AND deliveryStatus != 'DELIVERED'
          AND (deliveryStatus IN ('NOT_DELIVERED', 'FAILED') OR (deliveryStatus = 'DELIVERING' AND deliveryLeaseUntil < ?))
          AND (deliveryTypeSnapshot = 'FIXED_CARD' OR NOT EXISTS (SELECT 1 FROM automaticDeliveryJob earlier JOIN \`order\` earlierOrder ON earlierOrder.id = earlier.orderId WHERE earlier.id < (SELECT id FROM automaticDeliveryJob WHERE orderId = ?) AND earlier.status IN ('PENDING', 'PROCESSING') AND earlierOrder.deliveryTypeSnapshot = 'CARD_AUTO'))`)
        .bind(token, leaseUntil, now.getTime(), orderId, now.getTime(), orderId),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
      database.prepare("UPDATE automaticDeliveryJob SET status = 'PROCESSING', leaseUntil = ?, attemptCount = attemptCount + 1, updatedAt = ? WHERE orderId = ? AND status IN ('PENDING', 'PROCESSING', 'FAILED')").bind(leaseUntil, now.getTime(), orderId),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function deliverPaidOrder(database: D1Database, orderId: number): Promise<DeliveryResult> {
  const db = createDrizzleDb(database);
  const [record] = await db.select({ id: order.id, productId: order.productId, quantity: order.quantity, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, deliveryType: order.deliveryTypeSnapshot, fixedDeliveryContent: order.fixedDeliveryContentSnapshot }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "PAID") fail("ORDER_NOT_PAID");
  if (record.deliveryStatus === "DELIVERED") return { status: "DELIVERED" };
  if (record.deliveryType === "MANUAL" || record.deliveryType === "EXPRESS") return { status: "NOT_AUTOMATIC" };

  const token = crypto.randomUUID();
  const now = new Date();
  if (!(await claimAutomaticDelivery(database, orderId, token, now))) return { status: "PENDING" };
  const deliveryType = record.deliveryType === "FIXED_CARD" ? "FIXED_CARD" as const : "CARD" as const;
  try {
    const contents = record.deliveryType === "FIXED_CARD"
      ? (record.fixedDeliveryContent?.trim() ? [record.fixedDeliveryContent.trim()] : fail("FIXED_DELIVERY_CONTENT_MISSING"))
      : (await allocateCardsForPaidOrder(database, orderId, record.productId, record.quantity)).map((item) => item.content);
    const completedAt = Date.now();
    await database.batch([
      database.prepare("INSERT INTO orderDelivery (orderId, deliveryType, attemptToken, contentSnapshot, errorCode, status, createdAt) SELECT id, ?, ?, ?, NULL, 'SUCCESS', ? FROM `order` WHERE id = ? AND deliveryStatus = 'DELIVERING' AND deliveryToken = ?").bind(deliveryType, token, JSON.stringify(contents), completedAt, orderId, token),
      database.prepare("UPDATE `order` SET status = 'DELIVERED', deliveryStatus = 'DELIVERED', deliveryToken = NULL, deliveryLeaseUntil = NULL, deliveredAt = ?, updatedAt = ? WHERE id = ? AND deliveryStatus = 'DELIVERING' AND deliveryToken = ?").bind(completedAt, completedAt, orderId, token),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
      database.prepare("UPDATE automaticDeliveryJob SET status = 'SUCCESS', leaseUntil = NULL, lastError = NULL, updatedAt = ? WHERE orderId = ? AND status = 'PROCESSING'").bind(completedAt, orderId),
      database.prepare("INSERT INTO orderEvent (eventKey, orderId, scene, status, attemptCount, availableAt, createdAt, updatedAt) SELECT ?, id, 'DELIVERY_SUCCESS', 'PENDING', 0, ?, ?, ? FROM `order` WHERE id = ? AND deliveryStatus = 'DELIVERED' ON CONFLICT(eventKey) DO NOTHING").bind(`delivery-success:${token}`, completedAt, completedAt, completedAt, orderId),
    ]);
    return { status: "DELIVERED" };
  } catch (cause) {
    const errorCode = cause instanceof Error ? cause.message : "DELIVERY_FAILED";
    const failedAt = Date.now();
    await database.batch([
      database.prepare("INSERT INTO orderDelivery (orderId, deliveryType, attemptToken, contentSnapshot, errorCode, status, createdAt) SELECT id, ?, ?, NULL, ?, 'FAILED', ? FROM `order` WHERE id = ? AND deliveryStatus = 'DELIVERING' AND deliveryToken = ?").bind(deliveryType, token, errorCode, failedAt, orderId, token),
      database.prepare("UPDATE `order` SET status = 'FAILED', deliveryStatus = 'FAILED', deliveryToken = NULL, deliveryLeaseUntil = NULL, deliveredAt = NULL, updatedAt = ? WHERE id = ? AND deliveryStatus = 'DELIVERING' AND deliveryToken = ?").bind(failedAt, orderId, token),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
      database.prepare("UPDATE automaticDeliveryJob SET status = 'FAILED', leaseUntil = NULL, lastError = ?, updatedAt = ? WHERE orderId = ? AND status = 'PROCESSING'").bind(errorCode, failedAt, orderId),
      database.prepare("INSERT INTO orderEvent (eventKey, orderId, scene, errorMessage, status, attemptCount, availableAt, createdAt, updatedAt) SELECT ?, id, 'DELIVERY_FAILED', ?, 'PENDING', 0, ?, ?, ? FROM `order` WHERE id = ? AND deliveryStatus = 'FAILED' ON CONFLICT(eventKey) DO NOTHING").bind(`delivery-failed:${token}`, errorCode, failedAt, failedAt, failedAt, orderId),
    ]);
    return { status: "FAILED", errorCode };
  }
}

export async function processPendingAutomaticDeliveries(database: D1Database, limit = 50) {
  const db = createDrizzleDb(database);
  const jobs = await db.select({ orderId: automaticDeliveryJob.orderId, deliveryType: order.deliveryTypeSnapshot }).from(automaticDeliveryJob).innerJoin(order, eq(order.id, automaticDeliveryJob.orderId)).where(or(eq(automaticDeliveryJob.status, "PENDING"), eq(automaticDeliveryJob.status, "PROCESSING"))).orderBy(asc(automaticDeliveryJob.id)).limit(limit);
  let delivered = 0;
  let cardQueueBlocked = false;
  let attempted = 0;
  for (const job of jobs) {
    if (job.deliveryType === "CARD_AUTO" && cardQueueBlocked) continue;
    attempted += 1;
    const result = await deliverPaidOrder(database, job.orderId);
    if (result.status === "DELIVERED") delivered += 1;
    if (job.deliveryType === "CARD_AUTO" && result.status === "PENDING") cardQueueBlocked = true;
  }
  return { attempted, delivered };
}

export type QueriedOrder = {
  orderNo: string;
  status: "PENDING" | "PAID" | "DELIVERED" | "CLOSED" | "FAILED";
  paymentStatus: "UNPAID" | "PAID" | "FAILED";
  deliveryStatus: "NOT_DELIVERED" | "DELIVERING" | "DELIVERED" | "FAILED";
  paymentChannel: string | null;
  productName: string;
  quantity: number;
  amount: string;
  createdAt: Date;
  deliveries: string[];
};

export async function getOrderForQuery(database: D1Database, orderNo: string, queryToken: string): Promise<QueriedOrder | null> {
  const normalizedOrderNo = orderNo.trim();
  const normalizedQueryToken = queryToken.trim();
  if (!normalizedOrderNo || !normalizedQueryToken) return null;
  const db = createDrizzleDb(database);
  const [record] = await db.select({ id: order.id, orderNo: order.orderNo, queryToken: order.queryToken, status: order.status, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, paymentChannel: order.paymentChannel, productName: order.productNameSnapshot, quantity: order.quantity, amount: order.amount, createdAt: order.createdAt }).from(order).where(eq(order.orderNo, normalizedOrderNo)).limit(1);
  if (!record || record.queryToken !== normalizedQueryToken) return null;
  const deliveries = await db.select({ contentSnapshot: orderDelivery.contentSnapshot }).from(orderDelivery).where(and(eq(orderDelivery.orderId, record.id), eq(orderDelivery.status, "SUCCESS"))).orderBy(asc(orderDelivery.id));
  return {
    orderNo: record.orderNo,
    status: record.status,
    paymentStatus: record.paymentStatus,
    deliveryStatus: record.deliveryStatus,
    paymentChannel: record.paymentChannel,
    productName: record.productName,
    quantity: record.quantity,
    amount: formatCentsAsYuan(record.amount),
    createdAt: record.createdAt,
    deliveries: deliveries.flatMap((item) => {
      if (!item.contentSnapshot) return [];
      try {
        const parsed = JSON.parse(item.contentSnapshot) as unknown;
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [item.contentSnapshot];
      } catch {
        return [item.contentSnapshot];
      }
    }),
  };
}

export type OrderCloseMaintenanceResult = { scanned: number; closed: number };

export async function closeExpiredPendingOrders(database: D1Database, cutoff: Date, limit = 100): Promise<OrderCloseMaintenanceResult> {
  const db = createDrizzleDb(database);
  const records = await db.select({ id: order.id }).from(order).where(and(eq(order.status, "PENDING"), eq(order.paymentStatus, "UNPAID"), lt(order.createdAt, cutoff))).limit(limit);
  let closed = 0;
  for (const record of records) if ((await closePendingOrder(database, record.id)).closed) closed += 1;
  return { scanned: records.length, closed };
}

export async function closePendingOrder(database: D1Database, orderId: number): Promise<{ closed: boolean }> {
  const db = createDrizzleDb(database);
  const [record] = await db.select({ orderNo: order.orderNo, productId: order.productId, quantity: order.quantity, paymentProvider: order.paymentProvider, discountCodeId: order.discountCodeId, physicalStockReserved: order.physicalStockReserved }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (record.physicalStockReserved) statements.push(database.prepare("UPDATE product SET physicalStock = physicalStock + ?, updatedAt = ? WHERE id = ? AND EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID' AND physicalStockReserved = 1)").bind(record.quantity, now, record.productId, orderId));
  if (record.discountCodeId !== null) statements.push(database.prepare("UPDATE discountCode SET reservedCount = CASE WHEN reservedCount > 0 THEN reservedCount - 1 ELSE 0 END, updatedAt = ? WHERE id = ? AND EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID')").bind(now, record.discountCodeId, orderId));
  statements.push(
    database.prepare("UPDATE `order` SET status = 'CLOSED', physicalStockReserved = 0, closedAt = ?, updatedAt = ? WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID'").bind(now, now, orderId),
    database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
  );
  try {
    await database.batch(statements);
  } catch {
    return { closed: false };
  }
  await new PaymentLogService(database).writeBestEffort({ orderId, provider: record.paymentProvider as PaymentProviderKind, orderNo: record.orderNo, eventType: "AUTO_CLOSE", verifyStatus: "PENDING", message: "订单超时未支付，已自动关闭（30分钟）", payload: {} });
  return { closed: true };
}
