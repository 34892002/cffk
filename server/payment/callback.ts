import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { parseAmountToCents } from "@/lib/payment-utils";
import { order, paymentLog } from "@/database/drizzle/schema";
import { notifyOrderEmailEvents } from "@/server/email/order-events";
import { markOrderPaid } from "@/server/order/service";
import { verifyAlipayCallback } from "./alipay";
import { getPaymentProvider } from "./config";
import { reportUnexpectedServerError } from "@/server/error-handling";
import { sanitizeDatabaseLogJson, sanitizeDatabaseLogText } from "@/server/database-log-sanitizer";

function firstString(value: string | File | (string | File)[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}



async function logCallback(database: D1Database, input: {
  orderId?: number;
  orderNo: string;
  paymentOrderNo: string;
  rawPayload: string;
  verifyStatus: "PENDING" | "VERIFIED" | "FAILED";
  message: string;
}) {
  await createDrizzleDb(database).insert(paymentLog).values({
    orderId: input.orderId ?? null,
    provider: "ALIPAY",
    orderNo: input.orderNo || null,
    paymentOrderNo: input.paymentOrderNo || null,
    eventType: "NOTIFY",
    rawPayload: input.rawPayload,
    verifyStatus: input.verifyStatus,
    message: input.message,
    createdAt: new Date(),
  });
}

export async function handleAlipayCallback(database: D1Database, runtime: Record<string, unknown>, form: Record<string, string | File | (string | File)[] | undefined>) {
  const secrets = runtime;
  const parameters = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, firstString(value)]));
  const orderNo = parameters.out_trade_no ?? "";
  const paymentOrderNo = parameters.trade_no ?? "";
  const rawPayload = sanitizeDatabaseLogJson(parameters);
  const provider = await getPaymentProvider(database, "ALIPAY");
  if (!provider) {
    await logCallback(database, { orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: "PROVIDER_CONFIGURATION_INVALID" });
    return { ok: false, body: "failure" };
  }

  const verified = await verifyAlipayCallback(provider.configJson, secrets, parameters);
  if (!verified) {
    await logCallback(database, { orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: "SIGNATURE_INVALID" });
    return { ok: false, body: "failure" };
  }
  if (parameters.app_id !== JSON.parse(provider.configJson).appId) {
    await logCallback(database, { orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: "APP_ID_MISMATCH" });
    return { ok: false, body: "failure" };
  }
  if (parameters.trade_status !== "TRADE_SUCCESS" && parameters.trade_status !== "TRADE_FINISHED") {
    await logCallback(database, { orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: `TRADE_STATUS_${parameters.trade_status ?? "MISSING"}` });
    return { ok: false, body: "failure" };
  }

  const [record] = await createDrizzleDb(database)
    .select({ id: order.id, amount: order.amount, paymentProvider: order.paymentProvider, paymentStatus: order.paymentStatus })
    .from(order)
    .where(and(eq(order.orderNo, orderNo), eq(order.paymentProvider, "ALIPAY")))
    .limit(1);
  const amount = parseAmountToCents(parameters.total_amount ?? "");
  if (!record || amount === null || amount !== record.amount) {
    await logCallback(database, { orderId: record?.id, orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: "ORDER_OR_AMOUNT_MISMATCH" });
    return { ok: false, body: "failure" };
  }

  try {
    const outcome = await markOrderPaid(database, record.id);
    if (outcome === "NOT_PAYABLE") {
      await logCallback(database, { orderId: record.id, orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: "ORDER_NOT_PAYABLE" });
      return { ok: false, body: "failure" };
    }
    await notifyOrderEmailEvents(database, runtime, record.id);
    await logCallback(database, { orderId: record.id, orderNo, paymentOrderNo, rawPayload, verifyStatus: "VERIFIED", message: outcome === "ALREADY_PAID" ? "DUPLICATE_CALLBACK" : "PAYMENT_CONFIRMED" });
    return { ok: true, body: "success" };
  } catch (error) {
    reportUnexpectedServerError("alipay callback delivery", error, {
      parameters,
      orderId: record.id,
      orderNo,
      paymentOrderNo,
    });
    await logCallback(database, { orderId: record.id, orderNo, paymentOrderNo, rawPayload, verifyStatus: "FAILED", message: sanitizeDatabaseLogText(`DELIVERY_RETRY_REQUIRED:${error instanceof Error ? error.message : "UNKNOWN"}`) });
    return { ok: false, body: "failure" };
  }
}
