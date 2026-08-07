import { eq } from "drizzle-orm";
import { getContext } from "telefunc";
import { createDrizzleDb } from "@/database/drizzle";
import { order } from "@/database/drizzle/schema";
import { notifyOrderEmailEvents } from "@/server/email/order-events";
import { closePendingOrder, createOrder, type CreateOrderInput } from "@/server/order/service";
import { createAlipayPayment } from "./alipay";
import { getEnabledPaymentProvider } from "./config";

type TelefuncContext = {
  env?: Record<string, unknown> & { DB?: D1Database };
};

type CheckoutInput = Omit<CreateOrderInput, "allowPendingPayment" | "paymentProvider" | "paymentChannel"> & {
  paymentProvider: "ALIPAY";
};

export async function onCreatePayment(input: CheckoutInput) {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) throw new Error("DATABASE_UNAVAILABLE");

  const provider = await getEnabledPaymentProvider(context.env.DB, input.paymentProvider);
  if (!provider) throw new Error("PAYMENT_PROVIDER_NOT_AVAILABLE");

  const created = await createOrder(context.env.DB, {
    ...input,
    paymentProvider: provider.provider,
    paymentChannel: provider.channel ?? undefined,
    allowPendingPayment: true,
  });
  if (created.amount === 0) {
    await notifyOrderEmailEvents(context.env.DB, context.env, created.id);
    return { ...created, payment: null };
  }

  try {
    const payment = await createAlipayPayment({
      configJson: provider.configJson,
      secrets: context.env,
      orderNo: created.orderNo,
      queryToken: created.queryToken,
      amount: created.amount,
      subject: `订单 ${created.orderNo}`,
    });
    await createDrizzleDb(context.env.DB)
      .update(order)
      .set({ paymentOrderNo: payment.paymentOrderNo, updatedAt: new Date() })
      .where(eq(order.id, created.id));
    return { ...created, payment };
  } catch (error) {
    await closePendingOrder(context.env.DB, created.id).catch(() => undefined);
    throw error;
  }
}
