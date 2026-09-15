

import { reportUnexpectedServerError } from "@/server/error-handling";
import { getPaymentProvider } from "./config";
import { PaymentFlowService } from "./flow-service";
import { PaymentLogService } from "./log-service";
import { paymentRepository } from "./repository";
import { getProviderDefinition } from "./registry";
import type { PaymentProviderKind } from "./registry";

export function paymentCallbackResponse(ok: boolean) {
  return { body: ok ? "success" : "fail", contentType: "text/plain", status: ok ? 200 : 400 };
}

export class PaymentCallbackService {
  constructor(private readonly database: D1Database, private readonly runtime: Record<string, unknown> = {}) {}

  async handle(provider: PaymentProviderKind, input: { payload: Record<string, string>; rawBody?: string; rawBodyBytes?: Uint8Array; headers?: Headers }) {
    const logs = new PaymentLogService(this.database);
    const configured = await getPaymentProvider(this.database, provider);
    if (!configured || configured.configStatus !== "valid") {
      await logs.writeBestEffort({ provider, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_PROVIDER_NOT_AVAILABLE", payload: input.payload });
      return this.response(provider, false, input);
    }
    const definition = getProviderDefinition(provider);
    if (!definition) return this.response(provider, false, input);
    let result;
    try {
      const config = JSON.parse(configured.configJson) as Record<string, unknown>;
      result = await definition.createAdapter(config).verify(input);
    } catch (cause) {
      reportUnexpectedServerError("payment-callback-verify", cause, { provider });
      await logs.writeBestEffort({ provider, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_CALLBACK_INVALID", payload: input.payload });
      return this.response(provider, false, input);
    }
    const config = JSON.parse(configured.configJson) as Record<string, unknown>;
    const expectedCurrency = typeof config.currency === "string" ? config.currency.toUpperCase() : undefined;
    const record = result.orderNo ? await paymentRepository(this.database).findOrder(result.orderNo, provider) : null;
    const attempt = record ? await paymentRepository(this.database).findMatchingAttempt(record.id, provider, result.paymentOrderNo) : null;
    if (provider === "PERPAY" && result.verified && result.message === "PERPAY_REFUND_UPDATED") {
      await logs.writeBestEffort({ orderId: record?.id, provider, orderNo: result.orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "VERIFIED", message: result.message, payload: input.payload });
      return this.response(provider, true, input);
    }
    const callbackMatches = result.verified
      && result.orderNo
      && record
      && attempt
      && result.amount !== undefined
      && result.amount === record.amount
      && (!expectedCurrency || (result.currency !== undefined && result.currency.toUpperCase() === expectedCurrency))
      && record.paymentStatus !== "FAILED"
      && result.status === "PAID";
    if (!callbackMatches) {
      await logs.writeBestEffort({ orderId: record?.id, provider, orderNo: result.orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "FAILED", message: !result.verified ? "PAYMENT_CALLBACK_VERIFY_FAILED" : "PAYMENT_CALLBACK_INVALID", payload: input.payload });
      return this.response(provider, false, input);
    }
    if (!record || !result.orderNo || result.amount === undefined) return this.response(provider, false, input);
    const orderNo = result.orderNo;

    try {
      const outcome = await new PaymentFlowService(this.database, this.runtime).confirm(orderNo, "CALLBACK", result.amount, attempt!.id);
      if (outcome === "NOT_PAYABLE") {
        await logs.writeBestEffort({ orderId: record.id, provider, orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_CALLBACK_NOT_PAYABLE", payload: input.payload });
        return this.response(provider, false, input);
      }
      await logs.writeBestEffort({ orderId: record.id, provider, orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "VERIFIED", message: outcome, payload: input.payload });
      return this.response(provider, outcome === "CONFIRMED" || outcome === "DELIVERY_PENDING" || outcome === "DELIVERY_FAILED" || outcome === "ALREADY_PAID" || outcome === "PAYMENT_EXCEPTION", input);
    } catch (cause) {
      reportUnexpectedServerError("payment-callback-confirm", cause, { provider, orderNo });
      await logs.writeBestEffort({ orderId: record.id, provider, orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_CONFIRM_FAILED", payload: input.payload });
      return this.response(provider, false, input);
    }
  }

  private response(provider: PaymentProviderKind, ok: boolean, metadata?: { headers?: Headers }) {
    if (provider === "PERPAY") return { body: JSON.stringify({ schema: "perpay:webhook-ack:v1", ack: ok, event_id: metadata?.headers?.get("X-PerPay-Webhook-Event-Id") ?? "", delivery_id: metadata?.headers?.get("X-PerPay-Webhook-Delivery-Id") ?? "" }), contentType: "application/json", status: ok ? 200 : 400 };
    return paymentCallbackResponse(ok);
  }
}
