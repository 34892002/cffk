import { listScheduledTaskRuns } from "@/server/scheduled-task-log";
import { requireAdmin } from "@/server/telefunc-context";

export async function onGetScheduledTaskRuns(input?: { page?: number; pageSize?: number }) {
  const { database } = requireAdmin();
  return listScheduledTaskRuns(database, input?.page, input?.pageSize);
}
