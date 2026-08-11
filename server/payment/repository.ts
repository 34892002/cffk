import { and, desc, eq, or, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order, paymentAttempt, paymentLog, paymentProvider } from "@/database/drizzle/schema";

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
    async createAttempt(input: { orderId: number; provider: string; channel?: string | null }) {
      const now = new Date();
      const [record] = await db.insert(paymentAttempt).values({ orderId: input.orderId, provider: input.provider, channel: input.channel ?? null, status: "CREATING", createdAt: now, updatedAt: now }).returning({ id: paymentAttempt.id });
      return record?.id ?? null;
    },
    async completeAttempt(attemptId: number, paymentOrderNo?: string) {
      await db.update(paymentAttempt).set({ paymentOrderNo: paymentOrderNo ?? null, status: "PENDING", updatedAt: new Date() }).where(and(eq(paymentAttempt.id, attemptId), eq(paymentAttempt.status, "CREATING")));
    },
    async failAttempt(attemptId: number) {
      await db.update(paymentAttempt).set({ status: "FAILED", updatedAt: new Date() }).where(and(eq(paymentAttempt.id, attemptId), or(eq(paymentAttempt.status, "CREATING"), eq(paymentAttempt.status, "PENDING"))));
    },
    async findMatchingAttempt(orderId: number, provider: string, paymentOrderNo?: string) {
      const conditions = [eq(paymentAttempt.orderId, orderId), eq(paymentAttempt.provider, provider), or(eq(paymentAttempt.status, "PENDING"), eq(paymentAttempt.status, "PAID"))];
      // Alipay and Epay return their platform trade number in callbacks, while
      // creation records the merchant order number. Their signed merchant
      // order number, provider and amount are verified by the callback flow.
      if (paymentOrderNo && provider !== "ALIPAY" && provider !== "EPAY") conditions.push(eq(paymentAttempt.paymentOrderNo, paymentOrderNo));
      const [record] = await db.select().from(paymentAttempt).where(and(...conditions)).orderBy(desc(paymentAttempt.id)).limit(1);
      return record ?? null;
    },
    async findAttempt(attemptId: number) {
      const [record] = await db.select().from(paymentAttempt).where(eq(paymentAttempt.id, attemptId)).limit(1);
      return record ?? null;
    },
    async hasOtherPaidAttempt(orderId: number, attemptId: number) {
      const [record] = await db.select({ id: paymentAttempt.id }).from(paymentAttempt).where(and(eq(paymentAttempt.orderId, orderId), eq(paymentAttempt.status, "PAID"), sql`${paymentAttempt.id} != ${attemptId}`)).limit(1);
      return Boolean(record);
    },
    async latestAttempt(orderId: number) {
      const [record] = await db.select().from(paymentAttempt).where(and(eq(paymentAttempt.orderId, orderId), or(eq(paymentAttempt.status, "PENDING"), eq(paymentAttempt.status, "PAID")))).orderBy(desc(paymentAttempt.id)).limit(1);
      return record ?? null;
    },
    async markAttemptPaid(attemptId: number) {
      await db.update(paymentAttempt).set({ status: "PAID", updatedAt: new Date() }).where(and(eq(paymentAttempt.id, attemptId), eq(paymentAttempt.status, "PENDING")));
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
