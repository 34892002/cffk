import { and, eq } from "drizzle-orm";
import { getContext } from "telefunc";
import { createDrizzleDb } from "@/database/drizzle";
import { order } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { reportUnexpectedServerError } from "@/server/error-handling";
import { enqueueOrderEvent, processOrderEvents } from "@/server/email/order-events";
import { closePendingOrder, confirmOrderPayment, createOrder, type CreateOrderInput } from "@/server/order/service";
import { getEnabledPaymentProvider } from "./config";
import { getProviderDefinition } from "./registry";
import { PaymentLogService } from "./log-service";
import { paymentRepository } from "./repository";
import type { PaymentCreateInput, PaymentCreateResult } from "./types";
import type { PaymentChannel, PaymentProviderKind } from "./registry";

type RuntimeContext = { env?: Record<string, unknown> & { DB?: D1Database } };

export class PaymentFlowService {
  constructor(private readonly database: D1Database, private readonly runtime: Record<string, unknown> = {}) {}

  async create(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    const definition = getProviderDefinition(input.paymentProvider);
    if (!definition) appError("PAYMENT_PROVIDER_NOT_AVAILABLE");
    const provider = await getEnabledPaymentProvider(this.database, input.paymentProvider);
    if (!provider) appError("PAYMENT_PROVIDER_NOT_AVAILABLE");
    const channel = input.paymentChannel ?? provider.channels[0];
    if (!channel || !provider.channels.includes(channel)) appError("PAYMENT_CHANNEL_INVALID");
    const created = await createOrder(this.database, { ...input, paymentChannel: channel, allowPendingPayment: true } as CreateOrderInput);
    const logs = new PaymentLogService(this.database);
    if (created.amount === 0) {
      await this.confirm(created.orderNo, "ZERO_AMOUNT");
      return { ...created, payment: null, paymentStatus: "PAID" };
    }
    const repository = paymentRepository(this.database);
    const attemptId = await repository.createAttempt({ orderId: created.id, provider: provider.provider, channel });
    if (attemptId === null) appError("PAYMENT_CREATE_FAILED");
    try {
      const config = JSON.parse(provider.configJson) as Record<string, unknown>;
      const adapter = definition.createAdapter(config);
      const result = await adapter.create({ orderNo: created.orderNo, queryToken: created.queryToken, amount: created.amount, subject: `订单 ${created.orderNo}`, channel, notifyUrl: String(config.notifyUrl ?? ""), returnUrl: String(config.returnUrl ?? "") });
      await repository.completeAttempt(attemptId, result.paymentOrderNo);
      await logs.writeBestEffort({ orderId: created.id, provider: provider.provider, orderNo: created.orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "CREATE", verifyStatus: "PENDING", payload: result });
      return { ...created, payment: result };
    } catch (cause) {
      reportUnexpectedServerError("payment-create", cause, { orderId: created.id, orderNo: created.orderNo, provider: provider.provider });
      await repository.failAttempt(attemptId).catch(() => undefined);
      await logs.writeBestEffort({ orderId: created.id, provider: provider.provider, orderNo: created.orderNo, eventType: "CREATE_FAILED", verifyStatus: "FAILED", message: "PAYMENT_CREATE_FAILED", payload: { error: cause instanceof Error ? cause.name : "unknown" } });
      await closePendingOrder(this.database, created.id).catch((closeCause) => reportUnexpectedServerError("payment-close-failed-order", closeCause, { orderId: created.id, orderNo: created.orderNo }));
      appError("PAYMENT_CREATE_FAILED");
    }
  }

  async resume(orderNo: string, queryToken: string): Promise<PaymentCreateResult> {
    const db = createDrizzleDb(this.database);
    const [record] = await db
      .select({ id: order.id, orderNo: order.orderNo, queryToken: order.queryToken, amount: order.amount, paymentProvider: order.paymentProvider, paymentChannel: order.paymentChannel })
      .from(order)
      .where(and(eq(order.orderNo, orderNo.trim()), eq(order.queryToken, queryToken.trim()), eq(order.status, "PENDING"), eq(order.paymentStatus, "UNPAID")))
      .limit(1);
    if (!record) appError("ORDER_NOT_FOUND");

    const provider = await getEnabledPaymentProvider(this.database, record.paymentProvider as PaymentProviderKind);
    const definition = provider && getProviderDefinition(provider.provider);
    if (!provider || !definition) appError("PAYMENT_PROVIDER_NOT_AVAILABLE");

    const repository = paymentRepository(this.database);
    const attemptId = await repository.createAttempt({ orderId: record.id, provider: provider.provider, channel: record.paymentChannel });
    if (attemptId === null) appError("PAYMENT_CREATE_FAILED");
    try {
      const config = JSON.parse(provider.configJson) as Record<string, unknown>;
      const payment = await definition.createAdapter(config).create({ orderNo: record.orderNo, queryToken: record.queryToken, amount: record.amount, subject: `订单 ${record.orderNo}`, channel: record.paymentChannel as PaymentChannel | undefined, notifyUrl: String(config.notifyUrl ?? ""), returnUrl: String(config.returnUrl ?? "") });
      await repository.completeAttempt(attemptId, payment.paymentOrderNo);
      await new PaymentLogService(this.database).writeBestEffort({ orderId: record.id, provider: provider.provider, orderNo: record.orderNo, paymentOrderNo: payment.paymentOrderNo, eventType: "RESUME", verifyStatus: "PENDING", payload: payment });
      return { orderNo: record.orderNo, queryToken: record.queryToken, amount: record.amount, paymentStatus: "UNPAID", payment };
    } catch (cause) {
      reportUnexpectedServerError("payment-resume", cause, { orderId: record.id, orderNo: record.orderNo, provider: provider.provider });
      await repository.failAttempt(attemptId).catch(() => undefined);
      await new PaymentLogService(this.database).writeBestEffort({ orderId: record.id, provider: provider.provider, orderNo: record.orderNo, eventType: "RESUME_FAILED", verifyStatus: "FAILED", message: "PAYMENT_CREATE_FAILED", payload: { error: cause instanceof Error ? cause.name : "unknown" } });
      appError("PAYMENT_CREATE_FAILED");
    }
  }

  async confirm(orderNo: string, source: string, amount?: number, paymentAttemptId?: number) {
    const repository = paymentRepository(this.database);
    const record = await repository.findOrder(orderNo);
    if (!record) appError("ORDER_NOT_FOUND");
    if (amount !== undefined && amount !== record.amount) appError("PAYMENT_AMOUNT_MISMATCH");
    const attempt = paymentAttemptId ? await repository.findAttempt(paymentAttemptId) : null;
    if (paymentAttemptId && (!attempt || attempt.orderId !== record.id)) appError("PAYMENT_CALLBACK_INVALID");
    const duplicatePayment = Boolean(paymentAttemptId && attempt?.status !== "PAID" && await repository.hasOtherPaidAttempt(record.id, paymentAttemptId));
    const result = await confirmOrderPayment(this.database, record.id);
    if (paymentAttemptId && result.outcome !== "NOT_PAYABLE") await repository.markAttemptPaid(paymentAttemptId);

    let outcome = result.outcome;
    let exceptionMessage: string | null = null;
    if (result.outcome === "PAYMENT_EXCEPTION") exceptionMessage = "订单关闭后收到付款，请人工核对支付流水并退款或处理。";
    else if (duplicatePayment) {
      outcome = "PAYMENT_EXCEPTION";
      exceptionMessage = "同一订单收到多个支付尝试的付款，请人工核对并处理重复收款。";
    }
    if (exceptionMessage && paymentAttemptId) {
      await enqueueOrderEvent(this.database, { eventKey: `payment-exception:${paymentAttemptId}`, orderId: record.id, scene: "PAYMENT_EXCEPTION", errorMessage: exceptionMessage });
    }
    await new PaymentLogService(this.database).writeBestEffort({ orderId: record.id, provider: record.paymentProvider as never, orderNo, eventType: "CONFIRM", verifyStatus: outcome === "NOT_PAYABLE" ? "FAILED" : "VERIFIED", message: result.deliveryError ? `${outcome}:${result.deliveryError}` : outcome, payload: { source, paymentAttemptId, exceptionMessage } });
    await processOrderEvents(this.database, this.runtime, new Date(), 20).catch(() => undefined);
    return outcome;
  }

  async query(orderNo: string, queryToken: string) {
    const order = await (await import("@/server/order/service")).getOrderForQuery(this.database, orderNo, queryToken);
    if (!order || order.paymentStatus !== "UNPAID") return order;
    const record = await paymentRepository(this.database).findOrder(orderNo);
    if (!record) return order;
    const provider = await getEnabledPaymentProvider(this.database, record.paymentProvider as never);
    const definition = provider && getProviderDefinition(provider.provider);
    if (!provider || !definition) return order;
    try {
      const adapter = definition.createAdapter(JSON.parse(provider.configJson) as Record<string, unknown>);
      if (!adapter.query) return order;
      const attempt = await paymentRepository(this.database).latestAttempt(record.id);
      const result = await adapter.query({ orderNo, paymentOrderNo: attempt?.paymentOrderNo ?? undefined, amount: record.amount });
      if (result.verified && result.status === "PAID" && result.amount === record.amount) {
        await this.confirm(orderNo, "QUERY", result.amount, attempt?.id);
        return (await import("@/server/order/service")).getOrderForQuery(this.database, orderNo, queryToken);
      }
    } catch {
      // A query failure must leave the local pending order queryable and retryable.
    }
    return order;
  }
}

export function requirePaymentFlowService() {
  const context = getContext<RuntimeContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");
  return new PaymentFlowService(context.env.DB, context.env);
}


