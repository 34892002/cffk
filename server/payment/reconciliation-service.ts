import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order, paymentAttempt } from "@/database/drizzle/schema";
import { reportUnexpectedServerError } from "@/server/error-handling";
import { getEnabledPaymentProvider } from "./config";
import { PaymentFlowService } from "./flow-service";
import { PaymentLogService } from "./log-service";
import { getProviderDefinition } from "./registry";
import type { PaymentAdapter, PaymentQueryResult } from "./types";

export type PaymentReconciliationResult = {
  scanned: number;
  confirmed: number;
  pending: number;
  failed: number;
  closeableOrderIds: number[];
};

type ReconciliationCandidate = {
  orderId: number;
  orderNo: string;
  amount: number;
  attemptId: number;
  paymentOrderNo: string | null;
};

type ReconciliationDependencies = {
  query: NonNullable<PaymentAdapter["query"]>;
  confirm(candidate: ReconciliationCandidate, result: PaymentQueryResult): Promise<void>;
  log(candidate: ReconciliationCandidate, result: PaymentQueryResult, status: "PENDING" | "VERIFIED" | "FAILED", message: string): Promise<void>;
  report(candidate: ReconciliationCandidate, cause: unknown): void;
};

export async function reconcilePaymentCandidates(candidates: ReconciliationCandidate[], dependencies: ReconciliationDependencies): Promise<PaymentReconciliationResult> {
  const summary: PaymentReconciliationResult = { scanned: candidates.length, confirmed: 0, pending: 0, failed: 0, closeableOrderIds: [] };
  for (const candidate of candidates) {
    try {
      const result = await dependencies.query({ orderNo: candidate.orderNo, paymentOrderNo: candidate.paymentOrderNo ?? undefined, amount: candidate.amount });
      if (!result.verified || result.orderNo !== candidate.orderNo) {
        summary.failed += 1;
        await dependencies.log(candidate, result, "FAILED", "PAYMENT_QUERY_VERIFY_FAILED");
        continue;
      }
      if (result.status !== "PAID") {
        summary.pending += 1;
        summary.closeableOrderIds.push(candidate.orderId);
        await dependencies.log(candidate, result, "PENDING", "PAYMENT_QUERY_PENDING");
        continue;
      }
      if (result.amount !== candidate.amount) {
        summary.failed += 1;
        await dependencies.log(candidate, result, "FAILED", "PAYMENT_QUERY_AMOUNT_MISMATCH");
        continue;
      }
      await dependencies.confirm(candidate, result);
      summary.confirmed += 1;
      await dependencies.log(candidate, result, "VERIFIED", "PAYMENT_QUERY_CONFIRMED");
    } catch (cause) {
      summary.failed += 1;
      dependencies.report(candidate, cause);
    }
  }
  return summary;
}

export async function reconcilePendingAlipayPayments(database: D1Database, runtime: Record<string, unknown> = {}, limit = 50): Promise<PaymentReconciliationResult> {
  const provider = await getEnabledPaymentProvider(database, "ALIPAY");
  const definition = provider && getProviderDefinition(provider.provider);
  if (!provider || !definition) return { scanned: 0, confirmed: 0, pending: 0, failed: 0, closeableOrderIds: [] };
  const adapter = definition.createAdapter(JSON.parse(provider.configJson) as Record<string, unknown>);
  if (!adapter.query) return { scanned: 0, confirmed: 0, pending: 0, failed: 0, closeableOrderIds: [] };

  const db = createDrizzleDb(database);
  const candidates = await db
    .select({ orderId: order.id, orderNo: order.orderNo, amount: order.amount, attemptId: paymentAttempt.id, paymentOrderNo: paymentAttempt.paymentOrderNo })
    .from(paymentAttempt)
    .innerJoin(order, eq(order.id, paymentAttempt.orderId))
    .where(and(
      eq(order.status, "PENDING"),
      eq(order.paymentStatus, "UNPAID"),
      eq(order.paymentProvider, "ALIPAY"),
      eq(paymentAttempt.provider, "ALIPAY"),
      eq(paymentAttempt.status, "PENDING"),
      sql`${paymentAttempt.id} = (SELECT MAX(pa.id) FROM paymentAttempt AS pa WHERE pa.orderId = ${order.id} AND pa.provider = 'ALIPAY' AND pa.status = 'PENDING')`,
    ))
    .orderBy(asc(order.createdAt), desc(paymentAttempt.id))
    .limit(Math.max(1, Math.min(limit, 100)));

  const logs = new PaymentLogService(database);
  const flow = new PaymentFlowService(database, runtime);
  return reconcilePaymentCandidates(candidates, {
    query: adapter.query,
    confirm: async (candidate, result) => {
      await flow.confirm(candidate.orderNo, "SCHEDULED_QUERY", result.amount, candidate.attemptId);
    },
    log: async (candidate, result, verifyStatus, message) => {
      if (verifyStatus === "PENDING" && await logs.hasRecent(candidate.orderId, "QUERY", "PENDING", new Date(Date.now() - 10 * 60 * 1000))) return;
      await logs.writeBestEffort({
        orderId: candidate.orderId,
        provider: "ALIPAY",
        orderNo: candidate.orderNo,
        paymentOrderNo: result.paymentOrderNo ?? candidate.paymentOrderNo ?? undefined,
        eventType: "QUERY",
        verifyStatus,
        message,
        payload: { status: result.status, verified: result.verified, amount: result.amount },
      });
    },
    report: (candidate, cause) => reportUnexpectedServerError("payment-scheduled-query", cause, { orderId: candidate.orderId, orderNo: candidate.orderNo, provider: "ALIPAY" }),
  });
}
