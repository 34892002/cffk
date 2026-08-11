import { and, count, desc, eq, gte, like, lt } from "drizzle-orm";
import { order, orderDelivery, paymentLog } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { dateBoundaryInTimezone } from "@/lib/site-timezone";
import { notifyOrderEmailEvents } from "@/server/email/order-events";
import { getSiteSettings } from "@/server/site/public-settings";
import { requireAdmin } from "@/server/telefunc-context";
import { closePendingOrder, deliverPaidOrder } from "./service";

type OrderStatus = "PENDING" | "PAID" | "DELIVERED" | "CLOSED" | "FAILED";
type DeliveryStatus = "NOT_DELIVERED" | "DELIVERING" | "DELIVERED" | "FAILED";


export async function onGetAdminOrders(input?: { query?: string; status?: OrderStatus; deliveryStatus?: DeliveryStatus; startDate?: string; endDate?: string; page?: number; pageSize?: number }) {
  const { database, db } = requireAdmin();
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input?.pageSize ?? 20)));
  const conditions = [];
  if (input?.query?.trim()) conditions.push(like(order.orderNo, `%${input.query.trim()}%`));
  if (input?.status) conditions.push(eq(order.status, input.status));
  if (input?.deliveryStatus) conditions.push(eq(order.deliveryStatus, input.deliveryStatus));
  if (input?.startDate || input?.endDate) {
    const timezone = (await getSiteSettings(database)).timezone;
    if (input.startDate) conditions.push(gte(order.createdAt, dateBoundaryInTimezone(input.startDate, timezone)));
    if (input.endDate) conditions.push(lt(order.createdAt, dateBoundaryInTimezone(input.endDate, timezone, true)));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [orders, totalRows] = await Promise.all([
    db.select({ id: order.id, orderNo: order.orderNo, productName: order.productNameSnapshot, quantity: order.quantity, amount: order.amount, contactType: order.contactType, contactValue: order.contactValue, paymentProvider: order.paymentProvider, paymentChannel: order.paymentChannel, status: order.status, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, createdAt: order.createdAt, paidAt: order.paidAt, deliveredAt: order.deliveredAt }).from(order).where(where).orderBy(desc(order.createdAt), desc(order.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(order).where(where),
  ]);
  return { orders: orders.map((record) => ({ ...record, amount: formatCentsAsYuan(record.amount) })), total: totalRows[0]?.value ?? 0, page, pageSize };
}

export async function onGetAdminOrderDetail(input: { orderId: number }) {
  const { db } = requireAdmin();
  const [record] = await db.select().from(order).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  const [deliveries, payments] = await Promise.all([
    db.select().from(orderDelivery).where(eq(orderDelivery.orderId, record.id)).orderBy(desc(orderDelivery.createdAt)),
    db.select({ id: paymentLog.id, eventType: paymentLog.eventType, verifyStatus: paymentLog.verifyStatus, message: paymentLog.message, createdAt: paymentLog.createdAt }).from(paymentLog).where(eq(paymentLog.orderId, record.id)).orderBy(desc(paymentLog.createdAt)),
  ]);
  return { order: { ...record, amount: formatCentsAsYuan(record.amount) }, deliveries, payments };
}

export async function onCloseAdminOrder(input: { orderId: number }) {
  const { database, db } = requireAdmin();
  await closePendingOrder(database, input.orderId);
  const [record] = await db.select({ id: order.id, status: order.status }).from(order).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  if (record.status !== "CLOSED") appError("ORDER_CANNOT_CLOSE");
  return record;
}

export async function onRetryAutomaticDelivery(input: { orderId: number }) {
  const { database, runtime, db } = requireAdmin();
  await deliverPaidOrder(database, input.orderId);
  await notifyOrderEmailEvents(database, runtime);
  const [record] = await db.select({ id: order.id, deliveryStatus: order.deliveryStatus }).from(order).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  if (record.deliveryStatus !== "DELIVERED") appError("ORDER_DELIVERY_NOT_COMPLETED");
  return record;
}

export async function onRecordManualDelivery(input: { orderId: number; content: string; failed?: boolean }) {
  const { database, runtime, db } = requireAdmin();
  const content = input.content.trim();
  if (!content) appError("DELIVERY_CONTENT_REQUIRED");
  const [record] = await db.select({ id: order.id, orderNo: order.orderNo, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, deliveryType: order.deliveryTypeSnapshot }).from(order).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "PAID") appError("ORDER_NOT_PAID");
  if (record.deliveryType !== "MANUAL" && record.deliveryType !== "EXPRESS") appError("ORDER_DELIVERY_TYPE_INVALID");
  if (record.deliveryStatus === "DELIVERED") appError("ORDER_ALREADY_DELIVERED");

  const token = crypto.randomUUID();
  const now = Date.now();
  const claimed = await database.prepare("UPDATE `order` SET deliveryStatus = 'DELIVERING', deliveryToken = ?, deliveryLeaseUntil = ?, updatedAt = ? WHERE id = ? AND paymentStatus = 'PAID' AND deliveryTypeSnapshot IN ('MANUAL', 'EXPRESS') AND (deliveryStatus IN ('NOT_DELIVERED', 'FAILED') OR (deliveryStatus = 'DELIVERING' AND deliveryLeaseUntil < ?))").bind(token, now + 5 * 60 * 1000, now, record.id, now).run();
  if (claimed.meta.changes !== 1) appError("ORDER_DELIVERY_IN_PROGRESS");
  const deliveryType = record.deliveryType;
  const scene = input.failed ? "DELIVERY_FAILED" : "DELIVERY_SUCCESS";
  const eventKey = `manual-${input.failed ? "failed" : "success"}:${token}`;
  const statements = input.failed
    ? [
        database.prepare("INSERT INTO orderDelivery (orderId, deliveryType, attemptToken, contentSnapshot, errorCode, status, createdAt) VALUES (?, ?, ?, NULL, ?, 'FAILED', ?)").bind(record.id, deliveryType, token, content, now),
        database.prepare("UPDATE `order` SET status = 'FAILED', deliveryStatus = 'FAILED', deliveryToken = NULL, deliveryLeaseUntil = NULL, updatedAt = ? WHERE id = ? AND deliveryStatus = 'DELIVERING' AND deliveryToken = ?").bind(now, record.id, token),
        database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
        database.prepare("INSERT INTO orderEvent (eventKey, orderId, scene, errorMessage, status, attemptCount, availableAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)").bind(eventKey, record.id, scene, content, now, now, now),
      ]
    : [
        database.prepare("INSERT INTO orderDelivery (orderId, deliveryType, attemptToken, contentSnapshot, errorCode, status, createdAt) VALUES (?, ?, ?, ?, NULL, 'SUCCESS', ?)").bind(record.id, deliveryType, token, JSON.stringify([content]), now),
        database.prepare("UPDATE `order` SET status = 'DELIVERED', deliveryStatus = 'DELIVERED', deliveryToken = NULL, deliveryLeaseUntil = NULL, deliveredAt = ?, updatedAt = ? WHERE id = ? AND deliveryStatus = 'DELIVERING' AND deliveryToken = ?").bind(now, now, record.id, token),
        database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
        database.prepare("INSERT INTO orderEvent (eventKey, orderId, scene, status, attemptCount, availableAt, createdAt, updatedAt) VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)").bind(eventKey, record.id, scene, now, now, now),
      ];
  try {
    await database.batch(statements);
  } catch {
    appError("ORDER_DELIVERY_IN_PROGRESS");
  }
  await notifyOrderEmailEvents(database, runtime);
  return { ...record, deliveryStatus: input.failed ? "FAILED" as const : "DELIVERED" as const };
}
