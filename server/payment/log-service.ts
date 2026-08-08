import { createDrizzleDb } from "@/database/drizzle";
import { paymentLog } from "@/database/drizzle/schema";
import { reportUnexpectedServerError } from "@/server/error-handling";
import type { PaymentProviderKind } from "./registry";

const SENSITIVE = /(sign|signature|key|secret|token|authorization|private|password|encrypted|raw_body)/i;

export function sanitizePaymentLogPayload(value: unknown): unknown {
  if (typeof value === "string") return value.length > 256 ? `[redacted:${value.length}]` : value;
  if (Array.isArray(value)) return value.map(sanitizePaymentLogPayload);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE.test(key) ? "[redacted]" : sanitizePaymentLogPayload(item)]));
  return value;
}

export class PaymentLogService {
  constructor(private readonly database: D1Database) {}

  async write(input: { orderId?: number; provider: PaymentProviderKind; orderNo?: string; paymentOrderNo?: string; eventType: string; verifyStatus: "PENDING" | "VERIFIED" | "FAILED"; message?: string; payload?: unknown }) {
    await createDrizzleDb(this.database).insert(paymentLog).values({
      orderId: input.orderId ?? null,
      provider: input.provider,
      orderNo: input.orderNo ?? null,
      paymentOrderNo: input.paymentOrderNo ?? null,
      eventType: input.eventType,
      rawPayload: JSON.stringify(sanitizePaymentLogPayload(input.payload ?? {})),
      verifyStatus: input.verifyStatus,
      message: input.message ?? null,
      createdAt: new Date(),
    });
  }

  async writeBestEffort(input: Parameters<PaymentLogService["write"]>[0]) {
    try {
      await this.write(input);
    } catch (cause) {
      reportUnexpectedServerError("payment-log", cause, {
        eventType: input.eventType,
        provider: input.provider,
        orderNo: input.orderNo,
      });
    }
  }
}
