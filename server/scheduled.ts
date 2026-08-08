import { retryDuePushes } from "./push/service";
import { closeExpiredPendingOrders } from "./order/service";

export const ORDER_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

export async function runScheduledMaintenance(database: D1Database, runtime: Record<string, unknown>, now = new Date()) {
  const cutoff = new Date(now.getTime() - ORDER_PAYMENT_TIMEOUT_MS);
  const [closedOrderCount, pushRetry] = await Promise.all([
    closeExpiredPendingOrders(database, cutoff),
    retryDuePushes(database, runtime, now),
  ]);
  return { closedOrderCount, pushRetry };
}
