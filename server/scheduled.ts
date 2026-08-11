import { reportUnexpectedServerError } from "./error-handling";
import { retryDuePushes } from "./push/service";
import { closeExpiredPendingOrders, processPendingAutomaticDeliveries } from "./order/service";
import { processOrderEvents } from "./email/order-events";
import { completeScheduledMaintenanceRun, markStaleScheduledTaskRuns, recordScheduledMaintenanceRunFailure, startScheduledMaintenanceRun } from "./scheduled-task-log";
import { reconcilePendingAlipayPayments } from "./payment/reconciliation-service";

export const ORDER_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

export async function runScheduledMaintenance(database: D1Database, runtime: Record<string, unknown>, now = new Date()) {
  let runId: number | null = null;
  try {
    await markStaleScheduledTaskRuns(database, now);
    runId = await startScheduledMaintenanceRun(database, now);
  } catch (cause) {
    reportUnexpectedServerError("scheduled-task-log-start", cause);
  }
  try {
    const cutoff = new Date(now.getTime() - ORDER_PAYMENT_TIMEOUT_MS);
    const reconciliation = await Promise.allSettled([reconcilePendingAlipayPayments(database, runtime)]).then(([result]) => result);
    const closeableAlipayOrderIds = reconciliation.status === "fulfilled" ? reconciliation.value.closeableOrderIds : [];
    const [orderCleanup, automaticDelivery] = await Promise.allSettled([
      closeExpiredPendingOrders(database, cutoff, 100, closeableAlipayOrderIds),
      processPendingAutomaticDeliveries(database),
    ]);
    const orderEvents = await processOrderEvents(database, runtime, now);
    const pushRetry = await Promise.allSettled([retryDuePushes(database, runtime, now)]).then(([result]) => result);

    if (reconciliation.status === "rejected") reportUnexpectedServerError("scheduled-payment-reconciliation", reconciliation.reason);
    if (orderCleanup.status === "rejected") {
      reportUnexpectedServerError("scheduled-order-auto-close", orderCleanup.reason, { cutoff: cutoff.toISOString() });
    }
    if (automaticDelivery.status === "rejected") reportUnexpectedServerError("scheduled-automatic-delivery", automaticDelivery.reason);
    if (pushRetry.status === "rejected") reportUnexpectedServerError("scheduled-push-retry", pushRetry.reason);

    const orderResult = orderCleanup.status === "fulfilled" ? orderCleanup.value : null;
    const automaticDeliveryResult = automaticDelivery.status === "fulfilled" ? automaticDelivery.value : null;
    const pushRetryResult = pushRetry.status === "fulfilled" ? pushRetry.value : null;
    const failures = [
      ...(reconciliation.status === "rejected" ? [`支付主动查询: ${errorMessage(reconciliation.reason)}`] : []),
      ...(orderCleanup.status === "rejected" ? [`订单自动关闭: ${errorMessage(orderCleanup.reason)}`] : []),
      ...(automaticDelivery.status === "rejected" ? [`自动交付: ${errorMessage(automaticDelivery.reason)}`] : []),
      ...(pushRetryResult && pushRetryResult.exhausted > 0 ? [`推送重试已耗尽: ${pushRetryResult.exhausted}`] : []),
      ...(pushRetry.status === "rejected" ? [`推送重试: ${errorMessage(pushRetry.reason)}`] : []),
    ];
    try {
      await completeScheduledMaintenanceRun(database, runId, {
        status: failures.length === 0 ? "SUCCESS" : orderResult === null && pushRetryResult === null ? "FAILED" : "PARTIAL",
        scannedOrderCount: orderResult?.scanned ?? null,
        closedOrderCount: orderResult?.closed ?? null,

        pushRetryAttempted: pushRetryResult?.attempted ?? null,
        pushRetrySent: pushRetryResult?.sent ?? null,
        pushRetryExhausted: pushRetryResult?.exhausted ?? null,
        error: failures.length ? failures.join("\n").slice(0, 1_000) : null,
        completedAt: new Date(),
      });
    } catch (cause) {
      reportUnexpectedServerError("scheduled-task-log-complete", cause, { runId });
    }

    return { reconciliation: reconciliation.status === "fulfilled" ? reconciliation.value : null, orderCleanup: orderResult, automaticDelivery: automaticDeliveryResult, orderEvents, pushRetry: pushRetryResult };
  } catch (cause) {
    try {
      await recordScheduledMaintenanceRunFailure(database, runId, cause, new Date());
    } catch (logCause) {
      reportUnexpectedServerError("scheduled-task-log-failure", logCause, { runId });
    }
    throw cause;
  }
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
