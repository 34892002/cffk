import { eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order } from "@/database/drizzle/schema";
import { dispatchPush, orderPushVariables } from "@/server/push/service";

type EmailRuntime = Record<string, unknown>;
type OrderScene = "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED";

async function notify(database: D1Database, runtime: EmailRuntime, orderId: number, scene: OrderScene, extraVariables: Record<string, string | number> = {}) {
  const variables = await orderPushVariables(database, orderId);
  if (!variables) return;
  const payload = { ...variables, ...extraVariables };
  await Promise.all([
    dispatchPush(database, runtime, { scene, messageType: "NORMAL", orderId, variables: payload, source: `order:${scene.toLowerCase()}` }),
    dispatchPush(database, runtime, { scene, messageType: "ADMIN", orderId, variables: payload, source: `order:${scene.toLowerCase()}` }),
  ]);
}

export async function notifyOrderEmailEvents(database: D1Database, runtime: EmailRuntime, orderId: number) {
  try {
    const [record] = await createDrizzleDb(database).select({ paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus }).from(order).where(eq(order.id, orderId)).limit(1);
    if (!record) return;
    if (record.paymentStatus === "PAID") await notify(database, runtime, orderId, "ORDER_PAID");
    if (record.deliveryStatus === "DELIVERED") await notify(database, runtime, orderId, "DELIVERY_SUCCESS");
  } catch {
    // Notification failures never change payment or order state.
  }
}

export async function notifyOrderDeliveryFailure(database: D1Database, runtime: EmailRuntime, orderId: number, errorMessage: string) {
  try {
    await notify(database, runtime, orderId, "DELIVERY_FAILED", { errorMessage });
  } catch {
    // Delivery failure notices are best-effort and cannot affect the recorded order state.
  }
}
