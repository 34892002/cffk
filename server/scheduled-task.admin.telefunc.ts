import { telefuncAction } from "@/server/telefunc-action";
import { clearScheduledTaskRuns, listScheduledTaskRuns } from "@/server/scheduled-task-log";
import { requireAdmin } from "@/server/telefunc-context";

async function internalOnGetScheduledTaskRuns(input?: { page?: number; pageSize?: number }) {
  const { database } = requireAdmin();
  return listScheduledTaskRuns(database, input?.page, input?.pageSize);
}

async function internalOnClearScheduledTaskRuns() {
  const { database } = requireAdmin();
  return clearScheduledTaskRuns(database);
}

export const onGetScheduledTaskRuns = telefuncAction(internalOnGetScheduledTaskRuns);
export const onClearScheduledTaskRuns = telefuncAction(internalOnClearScheduledTaskRuns);
