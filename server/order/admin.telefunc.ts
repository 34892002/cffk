import { and, count, desc, eq, gte, like, lt } from "drizzle-orm";
import { order, orderDelivery, paymentLog, product } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { dateBoundaryInTimezone } from "@/lib/site-timezone";
import { notifyOrderDeliveryFailure, notifyOrderEmailEvents } from "@/server/email/order-events";
import { getSiteSettings } from "@/server/site/public-settings";
import { requireAdmin } from "@/server/telefunc-context";
import { closePendingOrder, deliverPaidOrder } from "./service";

type OrderStatus = "PENDING" | "PAID" | "DELIVERED" | "CLOSED" | "FAILED";
type DeliveryStatus = "NOT_DELIVERED" | "DELIVERED" | "FAILED";


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
  return { orders, total: totalRows[0]?.value ?? 0, page, pageSize };
}

export async function onGetAdminOrderDetail(input: { orderId: number }) {
  const { db } = requireAdmin();
  const [record] = await db.select().from(order).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  const [deliveries, payments] = await Promise.all([
    db.select().from(orderDelivery).where(eq(orderDelivery.orderId, record.id)).orderBy(desc(orderDelivery.createdAt)),
    db.select({ id: paymentLog.id, eventType: paymentLog.eventType, verifyStatus: paymentLog.verifyStatus, message: paymentLog.message, createdAt: paymentLog.createdAt }).from(paymentLog).where(eq(paymentLog.orderId, record.id)).orderBy(desc(paymentLog.createdAt)),
  ]);
  return { order: record, deliveries, payments };
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
  await notifyOrderEmailEvents(database, runtime, input.orderId);
  const [record] = await db.select({ id: order.id, deliveryStatus: order.deliveryStatus }).from(order).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  if (record.deliveryStatus !== "DELIVERED") appError("ORDER_DELIVERY_NOT_COMPLETED");
  return record;
}

export async function onRecordManualDelivery(input: { orderId: number; content: string; failed?: boolean }) {
  const { database, runtime, db } = requireAdmin();
  const content = input.content.trim();
  if (!content) appError("DELIVERY_CONTENT_REQUIRED");
  const [record] = await db.select({ id: order.id, orderNo: order.orderNo, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus, productId: order.productId, deliveryType: product.deliveryType }).from(order).innerJoin(product, eq(order.productId, product.id)).where(eq(order.id, input.orderId)).limit(1);
  if (!record) appError("ORDER_NOT_FOUND");
  if (record.paymentStatus !== "PAID") appError("ORDER_NOT_PAID");
  if (record.deliveryType !== "MANUAL" && record.deliveryType !== "EXPRESS") appError("ORDER_DELIVERY_TYPE_INVALID");
  if (record.deliveryStatus === "DELIVERED") appError("ORDER_ALREADY_DELIVERED");

  const now = new Date();
  if (input.failed) {
    await db.update(order).set({ status: "FAILED", deliveryStatus: "FAILED", updatedAt: now }).where(eq(order.id, record.id));
    await notifyOrderDeliveryFailure(database, runtime, record.id, content);
    return { ...record, deliveryStatus: "FAILED" as const };
  }
  await db.insert(orderDelivery).values({ orderId: record.id, deliveryType: record.deliveryType, contentSnapshot: JSON.stringify([content]), status: "SUCCESS", createdAt: now }).onConflictDoNothing();
  await db.update(order).set({ status: "DELIVERED", deliveryStatus: "DELIVERED", deliveredAt: now, updatedAt: now }).where(eq(order.id, record.id));
  await notifyOrderEmailEvents(database, runtime, record.id);
  return { ...record, deliveryStatus: "DELIVERED" as const };
}
