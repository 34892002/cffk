import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { automaticDeliveryJob, customerAddress, discountCode, order, orderDelivery, productV2, productSku } from "@/database/drizzle/schema";
import { getProductSku } from "@/server/catalog/sku";
import { appError } from "@/lib/app-error";
import { isJsonFormEmail } from "@/lib/json-form-values";
import { normalizeOrderEmail } from "@/lib/local-orders";
import { canConfirmPayment } from "@/lib/order-state";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { validateDiscountForItem, positiveInteger } from "@/server/discount/service";
import { allocateCardsForPaidOrder, countAvailableCards } from "@/server/inventory/allocator";
import { validateAddressId, validateAddressInput } from "@/server/address/validation";
import { generateOrderNo } from "@/server/order/order-number";
import { PaymentLogService } from "@/server/payment/log-service";
import type { AddressSnapshot, PaymentAddressInput } from "@/server/payment/types";
import type { PaymentProviderKind } from "@/server/payment/registry";

const DELIVERY_LEASE_MS = 5 * 60 * 1000;

type ContactType = "EMAIL" | "QQ" | "TELEGRAM" | "OTHER";
type PaymentProvider = "ALIPAY" | "EPAY" | "BEPUSDT" | "STRIPE" | "HASHPAY";

export type CreateOrderInput = {
  productId: number;
  productSkuId: number;
  quantity: number;
  paymentProvider: PaymentProvider;
  paymentChannel?: string;
  contactType: ContactType;
  contactValue?: string;
  buyerNote?: string;
  addressId?: number;
  address?: PaymentAddressInput;
  discountCode?: string;
  allowPendingPayment?: boolean;
};

export type CreatedOrder = {
  id: number;
  orderNo: string;
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


export function normalizeOrderContact(contactType: ContactType, value: string | undefined) {
  const normalized = value?.trim() || null;
  if (!normalized) fail("CONTACT_VALUE_REQUIRED");
  if (contactType === "EMAIL" && !isJsonFormEmail(normalized)) fail("CONTACT_EMAIL_INVALID");
  return normalized;
}

function addressSnapshot(address: PaymentAddressInput): AddressSnapshot {
  const validated = validateAddressInput(address);
  return {
    version: 1,
    recipientName: validated.recipientName,
    phone: validated.phone,
    country: validated.country,
    province: validated.province,
    city: validated.city,
    district: validated.district,
    addressLine: validated.addressLine,
    postalCode: validated.postalCode,
  };
}

async function resolveAddressSnapshot(db: ReturnType<typeof createDrizzleDb>, input: CreateOrderInput, ownerUserId: string | null) {
  if (ownerUserId && input.addressId !== undefined) {
    const addressId = validateAddressId(input.addressId);
    const [stored] = await db.select({
      recipientName: customerAddress.recipientName,
      phone: customerAddress.phone,
      country: customerAddress.country,
      province: customerAddress.province,
      city: customerAddress.city,
      district: customerAddress.district,
      addressLine: customerAddress.addressLine,
      postalCode: customerAddress.postalCode,
    }).from(customerAddress).where(and(eq(customerAddress.id, addressId), eq(customerAddress.userId, ownerUserId))).limit(1);
    if (!stored) fail("ADDRESS_NOT_FOUND");
    return { version: 1, ...stored } satisfies AddressSnapshot;
  }
  return addressSnapshot(input.address as PaymentAddressInput);
}




export async function createOrder(database: D1Database, input: CreateOrderInput, ownerUserId: string | null): Promise<CreatedOrder> {
  const db = createDrizzleDb(database);
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  const requestedQuantity = positiveInteger(input.quantity, "QUANTITY");
  const contactValue = normalizeOrderContact(input.contactType, input.contactValue);
  const [item] = await db.select().from(productV2).where(and(eq(productV2.id, productId), eq(productV2.status, "ACTIVE"))).limit(1);
  if (!item) fail("PRODUCT_NOT_AVAILABLE");
  const sku = await getProductSku(db, item.id, positiveInteger(input.productSkuId, "PRODUCT_SKU_ID"));

  if (sku.deliveryType === "FIXED_CARD" && requestedQuantity !== 1) fail("PRODUCT_QUANTITY_INVALID");
  if (requestedQuantity < sku.minBuy || requestedQuantity > sku.maxBuy) fail("PRODUCT_QUANTITY_INVALID");
  const quantity = sku.deliveryType === "FIXED_CARD" ? 1 : requestedQuantity;
  if (sku.deliveryType === "CARD_AUTO" && (await countAvailableCards(database, sku.id)) < quantity) fail("PRODUCT_STOCK_NOT_ENOUGH");
  if (sku.deliveryType === "FIXED_CARD" && !sku.fixedDeliveryContent?.trim()) fail("PRODUCT_FIXED_CONTENT_MISSING");
  const addressSnapshotJson = sku.deliveryType === "EXPRESS"
    ? JSON.stringify(await resolveAddressSnapshot(db, input, ownerUserId))
    : null;

  const originalAmount = sku.price * quantity;
  let discountId: number | null = null;
  let discountCodeValue: string | null = null;
  let discountAmount = 0;
  if (input.discountCode?.trim()) {
    const validated = await validateDiscountForItem(db, sku, quantity, input.discountCode);
    discountId = validated.id;
    discountCodeValue = validated.code;
    discountAmount = validated.discountAmount;
  }

  const reservePhysical = (sku.deliveryType === "MANUAL" || sku.deliveryType === "EXPRESS") && sku.physicalStock !== null;
  const now = Date.now();
  const amount = Math.max(0, originalAmount - discountAmount);
  if (amount > 0 && input.allowPendingPayment === false) fail("PAYMENT_ADAPTER_NOT_AVAILABLE");
  const orderNo = generateOrderNo();
  const paymentChannel = normalizePaymentChannel(input.paymentProvider, input.paymentChannel);
  const statements: D1PreparedStatement[] = [
    database.prepare("INSERT INTO `order` (orderNo, ownerUserId, productId, productSkuId, productNameSnapshot, productSkuNameSnapshot, unitPrice, quantity, amount, contactType, contactValue, contactEmailNormalized, buyerNote, addressSnapshotJson, paymentProvider, paymentChannel, deliveryTypeSnapshot, fixedDeliveryContentSnapshot, physicalStockReserved, discountCodeId, discountCodeStr, originalAmount, discountAmount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      orderNo, ownerUserId, item.id, sku.id, item.name, sku.name, sku.price, quantity, amount, input.contactType, contactValue,
      input.contactType === "EMAIL" ? normalizeOrderEmail(contactValue) : null, input.buyerNote?.trim() || null,
      addressSnapshotJson, input.paymentProvider, paymentChannel, sku.deliveryType,
      sku.deliveryType === "FIXED_CARD" ? sku.fixedDeliveryContent!.trim() : null, reservePhysical ? 1 : 0,
      discountId, discountCodeValue, discountId === null ? null : originalAmount, discountId === null ? null : discountAmount,
      now, now,
    ),
  ];
  if (reservePhysical) {
    statements.push(
      database.prepare("UPDATE productSku SET physicalStock = physicalStock - ?, updatedAt = ? WHERE id = ? AND physicalStock >= ?").bind(quantity, now, sku.id, quantity),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
    );
  }
  if (discountId !== null) {
    statements.push(
      database.prepare("UPDATE discountCode SET reservedCount = reservedCount + 1, updatedAt = ? WHERE id = ? AND isActive = 1 AND (maxUses IS NULL OR usedCount + reservedCount < maxUses)").bind(now, discountId),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
    );
  }
  try {
    await database.batch(statements);
  } catch (cause) {
    if (String(cause).includes("transactionGuard_value_check")) {
      if (reservePhysical) {
        const [currentSku] = await db.select({ physicalStock: productSku.physicalStock }).from(productSku).where(eq(productSku.id, sku.id)).limit(1);
        if ((currentSku?.physicalStock ?? 0) < quantity) fail("PRODUCT_STOCK_NOT_ENOUGH");
      }
      if (discountId !== null) {
        const [currentDiscount] = await db.select({ isActive: discountCode.isActive, maxUses: discountCode.maxUses, usedCount: discountCode.usedCount, reservedCount: discountCode.reservedCount }).from(discountCode).where(eq(discountCode.id, discountId)).limit(1);
        if (!currentDiscount || !currentDiscount.isActive || (currentDiscount.maxUses !== null && currentDiscount.usedCount + currentDiscount.reservedCount >= currentDiscount.maxUses)) fail("DISCOUNT_CODE_EXHAUSTED");
      }
    }
    throw cause;
  }
  const [created] = await db.select({ id: order.id }).from(order).where(eq(order.orderNo, orderNo)).limit(1);
  if (!created) fail("ORDER_CREATE_FAILED");
  return { id: created.id, orderNo, amount, originalAmount: discountId === null ? null : originalAmount, discountAmount: discountId === null ? null : discountAmount, discountCode: discountCodeValue, paymentStatus: "UNPAID" };
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
  const [record] = await db.select({ id: order.id, productId: order.productId, productSkuId: order.productSkuId, quantity: order.quantity, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, deliveryType: order.deliveryTypeSnapshot, fixedDeliveryContent: order.fixedDeliveryContentSnapshot }).from(order).where(eq(order.id, orderId)).limit(1);
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
      : (record.productSkuId === null ? fail("PRODUCT_SKU_NOT_AVAILABLE") : (await allocateCardsForPaidOrder(database, orderId, record.quantity, record.productSkuId)).map((item) => item.content));
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
  let failed = 0;
  let cardQueueBlocked = false;
  let attempted = 0;
  for (const job of jobs) {
    if (job.deliveryType === "CARD_AUTO" && cardQueueBlocked) continue;
    attempted += 1;
    const result = await deliverPaidOrder(database, job.orderId);
    if (result.status === "DELIVERED") delivered += 1;
    if (result.status === "FAILED") failed += 1;
    if (job.deliveryType === "CARD_AUTO" && result.status === "PENDING") cardQueueBlocked = true;
  }
  return { attempted, delivered, failed };
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

export async function getOrderForQuery(database: D1Database, orderNo: string, ownerUserId: string | null, email?: string): Promise<QueriedOrder | null> {
  const normalizedOrderNo = orderNo.trim();
  if (!normalizedOrderNo) return null;
  const normalizedEmail = normalizeOrderEmail(email ?? "");
  const access = normalizedEmail
    ? and(
      isNull(order.ownerUserId),
      eq(order.contactType, "EMAIL"),
      eq(order.contactEmailNormalized, normalizedEmail),
    )
    : ownerUserId
      ? eq(order.ownerUserId, ownerUserId)
      : null;
  if (!access) return null;
  const db = createDrizzleDb(database);
  const [record] = await db.select({ id: order.id, orderNo: order.orderNo, status: order.status, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, paymentChannel: order.paymentChannel, productName: order.productNameSnapshot, quantity: order.quantity, amount: order.amount, createdAt: order.createdAt }).from(order).where(and(eq(order.orderNo, normalizedOrderNo), access)).limit(1);
  if (!record) return null;
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

export async function closeExpiredPendingOrders(database: D1Database, cutoff: Date, limit = 100, closeableAlipayOrderIds: readonly number[] = []): Promise<OrderCloseMaintenanceResult> {
  const db = createDrizzleDb(database);
  const records = await db.select({ id: order.id }).from(order).where(and(
    eq(order.status, "PENDING"),
    eq(order.paymentStatus, "UNPAID"),
    lt(order.createdAt, cutoff),
    or(sql`${order.paymentProvider} != 'ALIPAY'`, closeableAlipayOrderIds.length ? inArray(order.id, closeableAlipayOrderIds) : sql`0 = 1`),
  )).limit(limit);
  let closed = 0;
  for (const record of records) if ((await closePendingOrder(database, record.id)).closed) closed += 1;
  return { scanned: records.length, closed };
}

export async function closePendingOrder(database: D1Database, orderId: number): Promise<{ closed: boolean }> {
  const db = createDrizzleDb(database);
  const [record] = await db.select({ orderNo: order.orderNo, productId: order.productId, productSkuId: order.productSkuId, quantity: order.quantity, paymentProvider: order.paymentProvider, discountCodeId: order.discountCodeId, physicalStockReserved: order.physicalStockReserved }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!record) fail("ORDER_NOT_FOUND");
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (record.physicalStockReserved && record.productSkuId !== null) statements.push(database.prepare("UPDATE productSku SET physicalStock = physicalStock + ?, updatedAt = ? WHERE id = ? AND EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID' AND physicalStockReserved = 1)").bind(record.quantity, now, record.productSkuId, orderId));
  if (record.discountCodeId !== null) statements.push(database.prepare("UPDATE discountCode SET reservedCount = CASE WHEN reservedCount > 0 THEN reservedCount - 1 ELSE 0 END, updatedAt = ? WHERE id = ? AND EXISTS (SELECT 1 FROM `order` WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID')").bind(now, record.discountCodeId, orderId));
  const orderUpdateIndex = statements.length;
  statements.push(
    database.prepare("UPDATE `order` SET status = 'CLOSED', physicalStockReserved = 0, closedAt = ?, updatedAt = ? WHERE id = ? AND status = 'PENDING' AND paymentStatus = 'UNPAID'").bind(now, now, orderId),
    database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
  );
  try {
    const results = await database.batch(statements);
    if (results[orderUpdateIndex]?.meta.changes !== 1) return { closed: false };
  } catch {
    return { closed: false };
  }
  await new PaymentLogService(database).writeBestEffort({ orderId, provider: record.paymentProvider as PaymentProviderKind, orderNo: record.orderNo, eventType: "AUTO_CLOSE", verifyStatus: "PENDING", message: "订单超时未支付，已自动关闭（30分钟）", payload: {} });
  return { closed: true };
}
