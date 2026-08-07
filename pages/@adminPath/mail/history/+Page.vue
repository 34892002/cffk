<template>
  <section class="flex w-full flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-normal">发送历史</h1>
      <p class="mt-1 text-sm text-muted-foreground">每次发送尝试都会记录结果，便于排查 Provider、模板和收件人配置。</p>
    </div>

    <Alert v-if="error" variant="destructive"><AlertTitle>无法读取历史</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <AdminDataTable :columns="columns" :rows="logs" row-key="id" :show-actions="false" empty-text="没有符合条件的邮件记录。">
      <template #toolbar>
        <Select v-model="status" @update:model-value="resetAndLoad"><SelectTrigger class="h-8 min-w-28" aria-label="按状态筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="SUCCESS">成功</SelectItem><SelectItem value="FAILED">失败</SelectItem></SelectContent></Select>
        <Button variant="outline" size="icon-sm" :disabled="loading" aria-label="刷新数据" title="刷新数据" @click="loadLogs"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" /></Button>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #cell-scene="{ row }"><span class="font-mono text-xs">{{ row.scene }}</span></template>
      <template #cell-provider="{ row }"><span class="font-mono text-xs">{{ row.provider }}</span></template>
      <template #cell-subject="{ row }"><span class="block min-w-48 truncate">{{ row.subject || "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'SUCCESS' ? 'secondary' : 'destructive'">{{ row.status === "SUCCESS" ? "成功" : "失败" }}</Badge></template>
      <template #cell-result="{ row }"><span class="block min-w-48 break-all text-xs text-muted-foreground">{{ row.status === "SUCCESS" ? row.messageId || "-" : row.error || "-" }}</span></template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCwIcon } from "@lucide/vue";
import { onGetEmailLogs } from "@/server/email/admin.telefunc";

type EmailLog = Awaited<ReturnType<typeof onGetEmailLogs>>["logs"][number];
const columns: AdminTableColumn<EmailLog>[] = [
  { key: "createdAt", label: "时间" }, { key: "scene", label: "场景" }, { key: "provider", label: "Provider" }, { key: "toEmail", label: "收件人" }, { key: "subject", label: "主题" }, { key: "status", label: "状态" }, { key: "result", label: "结果" },
];
const logs = ref<EmailLog[]>([]);
const status = ref<"ALL" | "SUCCESS" | "FAILED">("ALL");
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);


async function loadLogs() {
  loading.value = true;
  error.value = null;
  try {
    const result = await onGetEmailLogs({ page: page.value, pageSize: pageSize.value, ...(status.value !== "ALL" ? { status: status.value } : {}) });
    logs.value = result.logs;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) {
    error.value = cause instanceof Error && cause.message === "ADMIN_ACCESS_REQUIRED" ? "管理员身份已失效，请重新登录。" : "读取邮件历史失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
}
function resetAndLoad() { page.value = 1; void loadLogs(); }
function changePage(value: number) { page.value = value; void loadLogs(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadLogs(); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
onMounted(loadLogs);
</script>
