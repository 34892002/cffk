import { and, desc, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order, paymentLog, paymentProvider } from "@/database/drizzle/schema";

export function paymentRepository(database: D1Database) {
  const db = createDrizzleDb(database);
  return {
    async findOrder(orderNo: string, provider?: string) {
      const conditions = provider ? and(eq(order.orderNo, orderNo), eq(order.paymentProvider, provider)) : eq(order.orderNo, orderNo);
      const [record] = await db.select().from(order).where(conditions).limit(1);
      return record ?? null;
    },
    async findProvider(provider: string) {
      const [record] = await db.select().from(paymentProvider).where(eq(paymentProvider.provider, provider)).limit(1);
      return record ?? null;
    },
    async setPaymentOrderNo(orderId: number, paymentOrderNo: string) {
      await db.update(order).set({ paymentOrderNo, updatedAt: new Date() }).where(eq(order.id, orderId));
    },
    async updatePaymentStatus(orderId: number, paymentStatus: "UNPAID" | "PAID" | "FAILED") {
      await db.update(order).set({ paymentStatus, updatedAt: new Date() }).where(eq(order.id, orderId));
    },
    async listLogs(input: { orderId?: number; provider?: string; page: number; pageSize: number }) {
      const conditions = [];
      if (input.orderId !== undefined) conditions.push(eq(paymentLog.orderId, input.orderId));
      if (input.provider) conditions.push(eq(paymentLog.provider, input.provider));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select({ id: paymentLog.id, orderId: paymentLog.orderId, provider: paymentLog.provider, orderNo: paymentLog.orderNo, paymentOrderNo: paymentLog.paymentOrderNo, eventType: paymentLog.eventType, verifyStatus: paymentLog.verifyStatus, message: paymentLog.message, createdAt: paymentLog.createdAt }).from(paymentLog).where(where).orderBy(desc(paymentLog.createdAt), desc(paymentLog.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    },
  };
}
