<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>无法读取任务日志</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
    <AdminDataTable :columns="columns" :rows="runs" row-key="id" :show-actions="false" empty-text="尚未记录 Cron 任务运行。">
      <template #toolbar>
        <div class="text-sm text-muted-foreground">Cloudflare Cron 每 5 分钟运行一次订单关闭与推送重试维护。</div>
        <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadRuns"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
      </template>
      <template #cell-startedAt="{ value }"><span class="whitespace-nowrap text-xs">{{ formatDate(value) }}</span></template>
      <template #cell-completedAt="{ value }"><span class="whitespace-nowrap text-xs">{{ value ? formatDate(value) : "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="statusVariant(row.status)">{{ statusLabel(row.status) }}</Badge></template>
      <template #cell-scannedOrderCount="{ value }">{{ value ?? "-" }}</template>
      <template #cell-closedOrderCount="{ value }">{{ value ?? "-" }}</template>
      <template #cell-compensation="{ row }">{{ compensationSummary(row) }}</template>
      <template #cell-pushRetry="{ row }">{{ retrySummary(row) }}</template>
      <template #cell-error="{ value }"><span class="block max-w-96 whitespace-pre-wrap break-all text-xs text-muted-foreground">{{ value || "-" }}</span></template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetScheduledTaskRuns } from "@/server/scheduled-task.admin.telefunc";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";

type ScheduledTaskRun = Awaited<ReturnType<typeof onGetScheduledTaskRuns>>["runs"][number];
const timezone = useSiteTimezone();
const columns: AdminTableColumn<ScheduledTaskRun>[] = [
  { key: "startedAt", label: "开始时间" },
  { key: "completedAt", label: "完成时间" },
  { key: "status", label: "状态" },
  { key: "scannedOrderCount", label: "扫描订单" },
  { key: "closedOrderCount", label: "实际关闭" },
  { key: "compensation", label: "资源补偿" },
  { key: "pushRetry", label: "推送重试" },
  { key: "error", label: "错误" },
];
const runs = ref<ScheduledTaskRun[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadRuns() {
  loading.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onGetScheduledTaskRuns({ page: page.value, pageSize: pageSize.value }), { notifyError: false });
    runs.value = result.runs;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
function changePage(value: number) { page.value = value; void loadRuns(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadRuns(); }
function formatDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(typeof value === "string" || typeof value === "number" ? value : Number.NaN);
  return Number.isNaN(date.getTime()) ? "-" : formatDateInTimezone(date, timezone.value, { dateStyle: "short", timeStyle: "medium" });
}
function compensationSummary(run: ScheduledTaskRun) {
  if (run.compensationRetried === null) return "-";
  return `${run.compensationRetried} 重试 / ${run.compensationFailed ?? 0} 失败${run.compensationExhausted ? ` / ${run.compensationExhausted} 已耗尽` : ""}`;
}
function retrySummary(run: ScheduledTaskRun) { return run.pushRetryAttempted === null ? "-" : `${run.pushRetrySent ?? 0} 成功 / ${run.pushRetryAttempted} 尝试${run.pushRetryExhausted ? ` / ${run.pushRetryExhausted} 已耗尽` : ""}`; }
function statusLabel(status: ScheduledTaskRun["status"]) { return { RUNNING: "运行中", SUCCESS: "成功", PARTIAL: "部分失败", FAILED: "失败" }[status]; }
function statusVariant(status: ScheduledTaskRun["status"]) { return status === "SUCCESS" ? "secondary" : status === "PARTIAL" || status === "FAILED" ? "destructive" : "outline"; }
onMounted(loadRuns);
</script>
