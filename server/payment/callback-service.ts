
import { notifyOrderEmailEvents } from "@/server/email/order-events";
import { reportUnexpectedServerError } from "@/server/error-handling";
import { getPaymentProvider } from "./config";
import { PaymentFlowService } from "./flow-service";
import { PaymentLogService } from "./log-service";
import { paymentRepository } from "./repository";
import { getProviderDefinition } from "./registry";
import type { PaymentProviderKind } from "./registry";

export class PaymentCallbackService {
  constructor(private readonly database: D1Database, private readonly runtime: Record<string, unknown> = {}) {}

  async handle(provider: PaymentProviderKind, input: { payload: Record<string, string>; rawBody?: string; headers?: Headers }) {
    const logs = new PaymentLogService(this.database);
    const configured = await getPaymentProvider(this.database, provider);
    if (!configured || configured.configStatus !== "valid") {
      await logs.writeBestEffort({ provider, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_PROVIDER_NOT_AVAILABLE", payload: input.payload });
      return this.response(provider, false);
    }
    const definition = getProviderDefinition(provider);
    if (!definition) return this.response(provider, false);
    let result;
    try {
      const config = JSON.parse(configured.configJson) as Record<string, unknown>;
      result = await definition.createAdapter(config).verify(input);
    } catch (cause) {
      reportUnexpectedServerError("payment-callback-verify", cause, { provider });
      await logs.writeBestEffort({ provider, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_CALLBACK_INVALID", payload: input.payload });
      return this.response(provider, false);
    }
    const config = JSON.parse(configured.configJson) as Record<string, unknown>;
    const expectedCurrency = typeof config.currency === "string" ? config.currency.toUpperCase() : undefined;
    const record = result.orderNo ? await paymentRepository(this.database).findOrder(result.orderNo, provider) : null;
    if (!result.verified || !result.orderNo || !record || (result.amount !== undefined && result.amount !== record.amount) || (result.paymentOrderNo && record.paymentOrderNo && result.paymentOrderNo !== record.paymentOrderNo) || record.paymentStatus === "FAILED" || (result.currency && expectedCurrency && result.currency.toUpperCase() !== expectedCurrency) || result.status !== "PAID") {
      await logs.writeBestEffort({ orderId: record?.id, provider, orderNo: result.orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "FAILED", message: !result.verified ? "PAYMENT_CALLBACK_VERIFY_FAILED" : "PAYMENT_CALLBACK_INVALID", payload: input.payload });
      return this.response(provider, false);
    }
    const orderNo = result.orderNo;

    try {
      const outcome = await new PaymentFlowService(this.database, this.runtime).confirm(orderNo, "CALLBACK", result.amount);
      if (outcome === "CONFIRMED") await notifyOrderEmailEvents(this.database, this.runtime, record.id);
      await logs.writeBestEffort({ orderId: record.id, provider, orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "VERIFIED", message: outcome, payload: input.payload });
      return this.response(provider, true);
    } catch (cause) {
      reportUnexpectedServerError("payment-callback-confirm", cause, { provider, orderNo });
      await logs.writeBestEffort({ orderId: record.id, provider, orderNo, paymentOrderNo: result.paymentOrderNo, eventType: "NOTIFY", verifyStatus: "FAILED", message: "PAYMENT_CONFIRM_FAILED", payload: input.payload });
      return this.response(provider, false);
    }
  }

  private response(provider: PaymentProviderKind, ok: boolean) {
    const protocol = getProviderDefinition(provider)?.callbackResponse;
    if (protocol === "bepusdt_json") return { body: JSON.stringify({ status_code: ok ? 200 : 500 }), contentType: "application/json", status: ok ? 200 : 400 };
    if (protocol === "hashpay_json") return { body: JSON.stringify({ code: ok ? "SUCCESS" : "FAIL" }), contentType: "application/json", status: ok ? 200 : 400 };
    return { body: ok ? "success" : "failure", contentType: "text/plain", status: ok ? 200 : 400 };
  }
}
