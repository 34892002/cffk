import { and, desc, eq, lt } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { scheduledTaskRun } from "@/database/drizzle/schema";

export type ScheduledTaskRunStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";

type CompleteScheduledTaskRunInput = {
  status: Exclude<ScheduledTaskRunStatus, "RUNNING">;
  scannedOrderCount: number | null;
  closedOrderCount: number | null;
  compensationRetried: number | null;
  compensationFailed: number | null;
  compensationExhausted: number | null;
  pushRetryAttempted: number | null;
  pushRetrySent: number | null;
  error: string | null;
  completedAt: Date;
};

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message.slice(0, 1_000) : String(cause).slice(0, 1_000);
}

export async function markStaleScheduledTaskRuns(database: D1Database, now: Date, timeoutMs = 10 * 60 * 1000) {
  const completedAt = new Date(now.getTime());
  await createDrizzleDb(database).update(scheduledTaskRun).set({
    status: "FAILED",
    error: "任务执行中断或超时",
    completedAt,
  }).where(and(eq(scheduledTaskRun.task, "MAINTENANCE"), eq(scheduledTaskRun.status, "RUNNING"), lt(scheduledTaskRun.startedAt, new Date(now.getTime() - timeoutMs))));
}

export async function startScheduledMaintenanceRun(database: D1Database, startedAt: Date) {
  const [record] = await createDrizzleDb(database).insert(scheduledTaskRun).values({
    task: "MAINTENANCE",
    status: "RUNNING",
    scannedOrderCount: null,
    closedOrderCount: null,
    compensationRetried: null,
    compensationFailed: null,
    compensationExhausted: null,
    pushRetryAttempted: null,
    pushRetrySent: null,
    error: null,
    startedAt,
    completedAt: null,
  }).returning({ id: scheduledTaskRun.id });
  return record?.id ?? null;
}

export async function completeScheduledMaintenanceRun(database: D1Database, runId: number | null, input: CompleteScheduledTaskRunInput) {
  if (runId === null) return;
  await createDrizzleDb(database).update(scheduledTaskRun).set(input).where(eq(scheduledTaskRun.id, runId));
}

export async function recordScheduledMaintenanceRunFailure(database: D1Database, runId: number | null, cause: unknown, completedAt: Date) {
  await completeScheduledMaintenanceRun(database, runId, {
    status: "FAILED",
    scannedOrderCount: null,
    closedOrderCount: null,
    compensationRetried: null,
    compensationFailed: null,
    compensationExhausted: null,
    pushRetryAttempted: null,
    pushRetrySent: null,
    error: errorMessage(cause),
    completedAt,
  });
}

export async function listScheduledTaskRuns(database: D1Database, page = 1, pageSize = 20) {
  const db = createDrizzleDb(database);
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const [runs, total] = await Promise.all([
    db.select().from(scheduledTaskRun).orderBy(desc(scheduledTaskRun.startedAt), desc(scheduledTaskRun.id)).limit(normalizedPageSize).offset((normalizedPage - 1) * normalizedPageSize),
    db.$count(scheduledTaskRun),
  ]);
  return { runs, total, page: normalizedPage, pageSize: normalizedPageSize };
}
