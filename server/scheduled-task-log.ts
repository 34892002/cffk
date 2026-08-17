import { desc, inArray } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { scheduledTaskRun } from "@/database/drizzle/schema";

export type ScheduledTaskRunStatus = "PARTIAL" | "FAILED";

export type ScheduledTaskFailureInput = {
  status: ScheduledTaskRunStatus;
  scannedOrderCount: number | null;
  closedOrderCount: number | null;
  pushRetryAttempted: number | null;
  pushRetrySent: number | null;
  pushRetryExhausted: number | null;
  error: string;
  startedAt: Date;
  completedAt: Date;
};

const RETAINED_ERROR_LOGS = 1_000;
const ERROR_LOG_CLEANUP_THRESHOLD = 1_100;

export async function recordScheduledMaintenanceFailure(database: D1Database, input: ScheduledTaskFailureInput) {
  const db = createDrizzleDb(database);
  await db.insert(scheduledTaskRun).values({
    task: "MAINTENANCE",
    ...input,
  });

  const boundary = await database.prepare(
    "SELECT id FROM scheduledTaskRun WHERE status IN ('PARTIAL', 'FAILED') ORDER BY id DESC LIMIT 1 OFFSET ?",
  ).bind(ERROR_LOG_CLEANUP_THRESHOLD - 1).first<{ id: number }>();
  if (!boundary) return;

  const retainedBoundary = await database.prepare(
    "SELECT id FROM scheduledTaskRun WHERE status IN ('PARTIAL', 'FAILED') ORDER BY id DESC LIMIT 1 OFFSET ?",
  ).bind(RETAINED_ERROR_LOGS - 1).first<{ id: number }>();
  if (retainedBoundary) {
    await database.prepare("DELETE FROM scheduledTaskRun WHERE status IN ('PARTIAL', 'FAILED') AND id < ?").bind(retainedBoundary.id).run();
  }
}

export async function clearScheduledTaskRuns(database: D1Database) {
  const result = await createDrizzleDb(database).delete(scheduledTaskRun);
  return { deleted: result.meta.changes };
}

export async function listScheduledTaskRuns(database: D1Database, page = 1, pageSize = 20) {
  const db = createDrizzleDb(database);
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const errorStatuses = ["PARTIAL", "FAILED"] as const;
  const [runs, total] = await Promise.all([
    db.select().from(scheduledTaskRun).where(inArray(scheduledTaskRun.status, errorStatuses)).orderBy(desc(scheduledTaskRun.startedAt), desc(scheduledTaskRun.id)).limit(normalizedPageSize).offset((normalizedPage - 1) * normalizedPageSize),
    db.$count(scheduledTaskRun, inArray(scheduledTaskRun.status, errorStatuses)),
  ]);
  return { runs, total, page: normalizedPage, pageSize: normalizedPageSize };
}
