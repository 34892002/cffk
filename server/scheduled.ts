import { reportUnexpectedServerError } from "./error-handling";
import { retryDuePushes } from "./push/service";
import { closeExpiredPendingOrders } from "./order/service";
import { completeScheduledMaintenanceRun, markStaleScheduledTaskRuns, recordScheduledMaintenanceRunFailure, startScheduledMaintenanceRun } from "./scheduled-task-log";

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
    const [orderCleanup, pushRetry] = await Promise.allSettled([
      closeExpiredPendingOrders(database, cutoff),
      retryDuePushes(database, runtime, now),
    ]);

    if (orderCleanup.status === "rejected") {
      reportUnexpectedServerError("scheduled-order-auto-close", orderCleanup.reason, { cutoff: cutoff.toISOString() });
    }
    if (pushRetry.status === "rejected") {
      reportUnexpectedServerError("scheduled-push-retry", pushRetry.reason);
    }

    const orderResult = orderCleanup.status === "fulfilled" ? orderCleanup.value : null;
    const pushRetryResult = pushRetry.status === "fulfilled" ? pushRetry.value : null;
    const failures = [
      ...(orderCleanup.status === "rejected" ? [`订单自动关闭: ${errorMessage(orderCleanup.reason)}`] : []),
      ...(orderResult && orderResult.compensationFailed > 0 ? [`资源补偿失败: ${orderResult.compensationFailed}`] : []),
      ...(orderResult && orderResult.compensationExhausted > 0 ? [`资源补偿重试已耗尽: ${orderResult.compensationExhausted}`] : []),
      ...(pushRetry.status === "rejected" ? [`推送重试: ${errorMessage(pushRetry.reason)}`] : []),
    ];
    try {
      await completeScheduledMaintenanceRun(database, runId, {
        status: failures.length === 0 ? "SUCCESS" : orderResult === null && pushRetryResult === null ? "FAILED" : "PARTIAL",
        scannedOrderCount: orderResult?.scanned ?? null,
        closedOrderCount: orderResult?.closed ?? null,
        compensationRetried: orderResult?.compensationRetried ?? null,
        compensationFailed: orderResult?.compensationFailed ?? null,
        compensationExhausted: orderResult?.compensationExhausted ?? null,
        pushRetryAttempted: pushRetryResult?.attempted ?? null,
        pushRetrySent: pushRetryResult?.sent ?? null,
        error: failures.length ? failures.join("\n").slice(0, 1_000) : null,
        completedAt: new Date(),
      });
    } catch (cause) {
      reportUnexpectedServerError("scheduled-task-log-complete", cause, { runId });
    }

    return { orderCleanup: orderResult, pushRetry: pushRetryResult };
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
