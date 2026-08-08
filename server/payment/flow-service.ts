import { getContext } from "telefunc";
import { appError } from "@/lib/app-error";
import { notifyOrderEmailEvents } from "@/server/email/order-events";
import { closePendingOrder, confirmOrderPayment, createOrder, type CreateOrderInput } from "@/server/order/service";
import { getEnabledPaymentProvider } from "./config";
import { getProviderDefinition } from "./registry";
import { PaymentLogService } from "./log-service";
import type { PaymentCreateInput, PaymentCreateResult } from "./types";

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
      await notifyOrderEmailEvents(this.database, this.runtime, created.id);
      return { ...created, payment: null, paymentStatus: "PAID" };
    }
    try {
      const config = JSON.parse(provider.configJson) as Record<string, unknown>;
      const adapter = definition.createAdapter(config);
      const result = await adapter.create({ orderNo: created.orderNo, queryToken: created.queryToken, amount: created.amount, subject: `订单 ${created.orderNo}`, channel, notifyUrl: String(config.notifyUrl ?? ""), returnUrl: String(config.returnUrl ?? "") });
      if (result.paymentOrderNo) await import("./repository").then(({ paymentRepository }) => paymentRepository(this.database).setPaymentOrderNo(created.id, result.paymentOrderNo!));
      await logs.writeBestEffort({ orderId: created.id, provider: provider.provider, orderNo: created.orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "CREATE", verifyStatus: "PENDING", payload: result });
      return { ...created, payment: result };
    } catch (cause) {
      await logs.writeBestEffort({ orderId: created.id, provider: provider.provider, orderNo: created.orderNo, eventType: "CREATE_FAILED", verifyStatus: "FAILED", message: "PAYMENT_CREATE_FAILED", payload: { error: cause instanceof Error ? cause.name : "unknown" } });
      await closePendingOrder(this.database, created.id).catch(() => undefined);
      appError("PAYMENT_CREATE_FAILED");
    }
  }

  async confirm(orderNo: string, source: string, amount?: number) {
    const record = await import("./repository").then(({ paymentRepository }) => paymentRepository(this.database).findOrder(orderNo));
    if (!record) appError("ORDER_NOT_FOUND");
    if (amount !== undefined && amount !== record.amount) appError("PAYMENT_AMOUNT_MISMATCH");
    const outcome = await confirmOrderPayment(this.database, record.id);
    await new PaymentLogService(this.database).writeBestEffort({ orderId: record.id, provider: record.paymentProvider as never, orderNo, paymentOrderNo: record.paymentOrderNo ?? undefined, eventType: "CONFIRM", verifyStatus: "VERIFIED", message: outcome, payload: { source } });
    return outcome;
  }

  async query(orderNo: string, queryToken: string) {
    const order = await (await import("@/server/order/service")).getOrderForQuery(this.database, orderNo, queryToken);
    if (!order || order.paymentStatus !== "UNPAID") return order;
    const record = await import("./repository").then(({ paymentRepository }) => paymentRepository(this.database).findOrder(orderNo));
    if (!record) return order;
    const provider = await getEnabledPaymentProvider(this.database, record.paymentProvider as never);
    const definition = provider && getProviderDefinition(provider.provider);
    if (!provider || !definition) return order;
    try {
      const adapter = definition.createAdapter(JSON.parse(provider.configJson) as Record<string, unknown>);
      if (!adapter.query) return order;
      const result = await adapter.query({ orderNo, paymentOrderNo: record.paymentOrderNo ?? undefined, amount: record.amount });
      if (result.verified && result.status === "PAID" && result.amount === record.amount) {
        await this.confirm(orderNo, "QUERY", result.amount);
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

export async function onCreatePayment(input: PaymentCreateInput) {
  return requirePaymentFlowService().create(input);
}
