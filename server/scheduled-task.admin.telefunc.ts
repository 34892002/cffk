import { telefuncAction } from "@/server/telefunc-action";
import { listScheduledTaskRuns } from "@/server/scheduled-task-log";
import { requireAdmin } from "@/server/telefunc-context";

async function internalOnGetScheduledTaskRuns(input?: { page?: number; pageSize?: number }) {
  const { database } = requireAdmin();
  return listScheduledTaskRuns(database, input?.page, input?.pageSize);
}

export const onGetScheduledTaskRuns = telefuncAction(internalOnGetScheduledTaskRuns);
