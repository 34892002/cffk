import { and, eq, lt, lte, or } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { reportUnexpectedServerError } from "@/server/error-handling";
import { discountCode, order, orderCloseCompensation, orderDelivery, product } from "@/database/drizzle/schema";
import { finalizeReservedCards, getCardsForOrderDelivery, releaseReservedCards, reserveCardsForOrder } from "@/server/inventory/allocator";
import { canConfirmPayment } from "../../lib/order-state";
import { PaymentLogService } from "@/server/payment/log-service";
import type { PaymentProviderKind } from "@/server/payment/registry";

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
  if (!contactValue) fail("CONTACT_VALUE_REQUIRED");

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


    return {
      id: created.id,
      orderNo,
      queryToken,
      amount,
      originalAmount: discountId === null ? null : originalAmount,
      discountAmount: discountId === null ? null : discountAmount,
      discountCode: discountCodeValue,
      paymentStatus: "UNPAID",
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

export async function confirmOrderPayment(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [record] = await db.select({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, discountCodeId: order.discountCodeId }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus === "PAID") {
    await deliverPaidOrder(database, orderId);
    return "ALREADY_PAID" as const;
  }
  if (!canConfirmPayment(record.status, record.paymentStatus)) return "NOT_PAYABLE" as const;

  const now = new Date();
  const statements: D1PreparedStatement[] = [];
  if (record.discountCodeId !== null) {
    statements.push(
      database.prepare("UPDATE discountCode SET reservedCount = reservedCount - 1, usedCount = usedCount + 1, updatedAt = ? WHERE id = ? AND reservedCount > 0 AND EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID')").bind(now.getTime(), record.discountCodeId, orderId),
      database.prepare("SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('PAYMENT_CONFIRM_DISCOUNT_CONFLICT') END"),
    );
  }
  statements.push(
    database.prepare("UPDATE `order` SET status = 'PAID', paymentStatus = 'PAID', paidAt = ?, updatedAt = ? WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID'").bind(now.getTime(), now.getTime(), orderId),
    database.prepare("SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('PAYMENT_CONFIRM_ORDER_CONFLICT') END"),
  );
  try {
    await database.batch(statements);
  } catch (cause) {
    const [current] = await db.select({ paymentStatus: order.paymentStatus }).from(order).where(eq(order.id, orderId)).limit(1);
    if (current?.paymentStatus === "PAID") {
      await deliverPaidOrder(database, orderId);
      return "ALREADY_PAID" as const;
    }
    if (record.discountCodeId !== null) fail("DISCOUNT_CODE_EXHAUSTED");
    if (cause instanceof Error) throw cause;
    fail("PAYMENT_CONFIRM_FAILED");
  }

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

export type OrderCloseMaintenanceResult = {
  scanned: number;
  closed: number;
  compensationRetried: number;
  compensationFailed: number;
  compensationExhausted: number;
};

export async function closeExpiredPendingOrders(database: D1Database, cutoff: Date, limit = 100): Promise<OrderCloseMaintenanceResult> {
  const db = createDrizzleDb(database);
  const records = await db
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.status, "PENDING"), eq(order.paymentStatus, "UNPAID"), lt(order.createdAt, cutoff)))
    .limit(limit);

  let closed = 0;
  let compensationFailed = 0;
  let compensationExhausted = 0;
  for (const record of records) {
    const result = await closePendingOrder(database, record.id);
    if (result.closed) closed += 1;
    if (result.compensationFailed) compensationFailed += 1;
    if (result.compensationExhausted) compensationExhausted += 1;
  }

  const compensation = await retryOrderCloseCompensations(database, new Date(), limit);
  return {
    scanned: records.length,
    closed,
    compensationRetried: compensation.retried,
    compensationFailed: compensation.failed + compensationFailed,
    compensationExhausted: compensation.exhausted + compensationExhausted,
  };
}

type OrderCloseResult = { closed: boolean; compensationFailed: boolean; compensationExhausted: boolean };

type CloseCompensationRecord = typeof orderCloseCompensation.$inferSelect;

const MAX_ORDER_CLOSE_COMPENSATION_ATTEMPTS = 5;
const ORDER_CLOSE_COMPENSATION_LEASE_MS = 10 * 60 * 1000;

async function claimOrderCloseCompensation(database: D1Database, record: CloseCompensationRecord, now: Date) {
  if (record.attempts >= MAX_ORDER_CLOSE_COMPENSATION_ATTEMPTS) return null;
  const [claimed] = await createDrizzleDb(database).update(orderCloseCompensation).set({
    status: "PROCESSING",
    attempts: record.attempts + 1,
    nextAttemptAt: new Date(now.getTime() + ORDER_CLOSE_COMPENSATION_LEASE_MS),
    updatedAt: now,
  }).where(and(
    eq(orderCloseCompensation.id, record.id),
    eq(orderCloseCompensation.status, record.status),
    eq(orderCloseCompensation.attempts, record.attempts),
    lte(orderCloseCompensation.nextAttemptAt, now),
  )).returning();
  return claimed ?? null;
}

async function applyOrderCloseCompensation(database: D1Database, record: CloseCompensationRecord) {
  const db = createDrizzleDb(database);
  const errors: string[] = [];
  const now = new Date();
  const attempts = record.attempts;

  if (!record.cardsReleased) {
    try {
      await database.batch([
        database.prepare("UPDATE card SET status = 'UNUSED', orderId = NULL, updatedAt = ? WHERE orderId = ? AND status = 'LOCKED' AND EXISTS (SELECT 1 FROM orderCloseCompensation WHERE id = ? AND status = 'PROCESSING' AND attempts = ? AND cardsReleased = 0)").bind(now.getTime(), record.orderId, record.id, attempts),
        database.prepare("UPDATE orderCloseCompensation SET cardsReleased = 1, updatedAt = ? WHERE id = ? AND status = 'PROCESSING' AND attempts = ?").bind(now.getTime(), record.id, attempts),
      ]);
    } catch (cause) {
      errors.push(`cards: ${errorMessage(cause)}`);
      reportUnexpectedServerError("order-auto-close-release-cards", cause, { orderId: record.orderId });
    }
  }
  if (!record.stockRestored && (record.deliveryType === "MANUAL" || record.deliveryType === "EXPRESS")) {
    try {
      await database.batch([
        database.prepare("UPDATE product SET physicalStock = physicalStock + ?, updatedAt = ? WHERE id = ? AND EXISTS (SELECT 1 FROM orderCloseCompensation WHERE id = ? AND status = 'PROCESSING' AND attempts = ? AND stockRestored = 0)").bind(record.quantity, now.getTime(), record.productId, record.id, attempts),
        database.prepare("UPDATE orderCloseCompensation SET stockRestored = 1, updatedAt = ? WHERE id = ? AND status = 'PROCESSING' AND attempts = ?").bind(now.getTime(), record.id, attempts),
      ]);
    } catch (cause) {
      errors.push(`stock: ${errorMessage(cause)}`);
      reportUnexpectedServerError("order-auto-close-restore-stock", cause, { orderId: record.orderId, productId: record.productId });
    }
  }
  if (!record.discountReleased && record.discountCodeId !== null) {
    try {
      await database.batch([
        database.prepare("UPDATE discountCode SET reservedCount = CASE WHEN reservedCount > 0 THEN reservedCount - 1 ELSE 0 END, updatedAt = ? WHERE id = ? AND EXISTS (SELECT 1 FROM orderCloseCompensation WHERE id = ? AND status = 'PROCESSING' AND attempts = ? AND discountReleased = 0)").bind(now.getTime(), record.discountCodeId, record.id, attempts),
        database.prepare("UPDATE orderCloseCompensation SET discountReleased = 1, updatedAt = ? WHERE id = ? AND status = 'PROCESSING' AND attempts = ?").bind(now.getTime(), record.id, attempts),
      ]);
    } catch (cause) {
      errors.push(`discount: ${errorMessage(cause)}`);
      reportUnexpectedServerError("order-auto-close-release-discount", cause, { orderId: record.orderId, discountCodeId: record.discountCodeId });
    }
  }

  await db.update(orderCloseCompensation).set({
    attempts,
    status: errors.length ? attempts >= MAX_ORDER_CLOSE_COMPENSATION_ATTEMPTS ? "EXHAUSTED" : "PENDING" : "COMPLETED",
    lastError: errors.length ? errors.join("\\n").slice(0, 1_000) : null,
    nextAttemptAt: new Date(now.getTime() + (errors.length && attempts < MAX_ORDER_CLOSE_COMPENSATION_ATTEMPTS ? 5 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000)),
    updatedAt: now,
  }).where(and(eq(orderCloseCompensation.id, record.id), eq(orderCloseCompensation.status, "PROCESSING"), eq(orderCloseCompensation.attempts, attempts)));
  return { failed: errors.length > 0, exhausted: errors.length > 0 && attempts >= MAX_ORDER_CLOSE_COMPENSATION_ATTEMPTS };
}

function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }

export async function retryOrderCloseCompensations(database: D1Database, now: Date, limit = 100) {
  const db = createDrizzleDb(database);
  const timedOut = await db.update(orderCloseCompensation).set({ status: "EXHAUSTED", lastError: "ORDER_CLOSE_COMPENSATION_PROCESSING_TIMEOUT", updatedAt: now })
    .where(and(eq(orderCloseCompensation.status, "PROCESSING"), lte(orderCloseCompensation.nextAttemptAt, now), eq(orderCloseCompensation.attempts, MAX_ORDER_CLOSE_COMPENSATION_ATTEMPTS)))
    .returning({ id: orderCloseCompensation.id });
  const records = await db.select({ compensation: orderCloseCompensation }).from(orderCloseCompensation)
    .innerJoin(order, eq(order.id, orderCloseCompensation.orderId))
    .where(and(lte(orderCloseCompensation.nextAttemptAt, now), or(eq(orderCloseCompensation.status, "PENDING"), eq(orderCloseCompensation.status, "PROCESSING")), eq(order.status, "CLOSED"), eq(order.paymentStatus, "UNPAID")))
    .limit(limit);
  let failed = 0;
  let exhausted = timedOut.length;
  let retried = 0;
  for (const record of records) {
    const claimed = await claimOrderCloseCompensation(database, record.compensation, now);
    if (!claimed) continue;
    retried += 1;
    const result = await applyOrderCloseCompensation(database, claimed);
    if (result.failed) failed += 1;
    if (result.exhausted) exhausted += 1;
  }
  return { retried, failed, exhausted };
}

export async function closePendingOrder(database: D1Database, orderId: number): Promise<OrderCloseResult> {
  const db = createDrizzleDb(database);
  const [record] = await db
    .select({ id: order.id, orderNo: order.orderNo, productId: order.productId, quantity: order.quantity, paymentProvider: order.paymentProvider, paymentOrderNo: order.paymentOrderNo, paymentStatus: order.paymentStatus, status: order.status, discountCodeId: order.discountCodeId, deliveryType: product.deliveryType, physicalStock: product.physicalStock })
    .from(order)
    .innerJoin(product, eq(order.productId, product.id))
    .where(eq(order.id, orderId))
    .limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "UNPAID" || record.status !== "PENDING") return { closed: false, compensationFailed: false, compensationExhausted: false };

  const now = new Date();
  let closeResult: D1Result;
  try {
    const results = await database.batch([
      database.prepare("INSERT OR IGNORE INTO orderCloseCompensation (orderId, productId, quantity, deliveryType, discountCodeId, cardsReleased, stockRestored, discountReleased, attempts, status, lastError, nextAttemptAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', NULL, ?, ?, ?)").bind(
        orderId,
        record.productId,
        record.quantity,
        record.deliveryType,
        record.discountCodeId,
        record.deliveryType !== "CARD_AUTO" ? 1 : 0,
        (record.deliveryType === "MANUAL" || record.deliveryType === "EXPRESS") && record.physicalStock !== null ? 0 : 1,
        record.discountCodeId === null ? 1 : 0,
        now.getTime(),
        now.getTime(),
        now.getTime(),
      ),
      database.prepare("UPDATE `order` SET status = 'CLOSED', closedAt = ?, updatedAt = ? WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID'").bind(now.getTime(), now.getTime(), orderId),
      database.prepare("DELETE FROM orderCloseCompensation WHERE orderId = ? AND NOT EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'CLOSED' AND paymentStatus = 'UNPAID')").bind(orderId, orderId),
    ]);
    closeResult = results[1]!;
  } catch (cause) {
    reportUnexpectedServerError("order-auto-close-prepare-compensation", cause, { orderId });
    return { closed: false, compensationFailed: true, compensationExhausted: false };
  }
  if (closeResult.meta.changes !== 1) return { closed: false, compensationFailed: false, compensationExhausted: false };

  const [compensation] = await db.select().from(orderCloseCompensation).where(eq(orderCloseCompensation.orderId, orderId)).limit(1);
  if (!compensation) return { closed: true, compensationFailed: true, compensationExhausted: false };
  const claimed = await claimOrderCloseCompensation(database, compensation, now);
  const compensationResult = claimed ? await applyOrderCloseCompensation(database, claimed) : { failed: compensation.status === "PROCESSING", exhausted: compensation.status === "EXHAUSTED" };

  await new PaymentLogService(database).writeBestEffort({
      orderId,
      provider: record.paymentProvider as PaymentProviderKind,
      orderNo: record.orderNo,
      paymentOrderNo: record.paymentOrderNo ?? undefined,
      eventType: "AUTO_CLOSE",
      verifyStatus: "PENDING",
      message: "订单超时未支付，已自动关闭（30分钟）",
    payload: {},
  });
  return { closed: true, compensationFailed: compensationResult.failed, compensationExhausted: compensationResult.exhausted };
}
