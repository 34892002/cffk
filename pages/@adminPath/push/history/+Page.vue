<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>无法读取发送日志</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
    <AdminDataTable :columns="columns" :rows="logs" row-key="id" :show-actions="false" empty-text="没有符合条件的推送记录。">
      <template #toolbar>
        <Select v-model="channel" @update:model-value="resetAndLoad"><SelectTrigger size="sm" class="min-w-28" aria-label="按渠道筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部渠道</SelectItem><SelectItem value="EMAIL">电子邮件</SelectItem><SelectItem value="WECOM">企业微信</SelectItem><SelectItem value="TELEGRAM">Telegram</SelectItem></SelectContent></Select>
        <Select v-model="status" @update:model-value="resetAndLoad"><SelectTrigger size="sm" class="min-w-28" aria-label="按状态筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="SUCCESS">成功</SelectItem><SelectItem value="FAILED">失败</SelectItem></SelectContent></Select>
        <Button variant="outline" size="icon-sm" :disabled="loading" aria-label="刷新数据" title="刷新数据" @click="loadLogs"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" /></Button>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #cell-channel="{ row }"><Badge variant="outline">{{ channelLabel(row.channel) }}</Badge></template>
      <template #cell-scene="{ row }"><span class="font-mono text-xs">{{ sceneLabel(row.scene) }}</span></template>
      <template #cell-recipient="{ value }"><span class="block max-w-52 truncate">{{ value }}</span></template>
      <template #cell-subject="{ value }"><span class="block max-w-52 truncate">{{ value || "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'SUCCESS' ? 'secondary' : 'destructive'">{{ row.status === "SUCCESS" ? "成功" : "失败" }}</Badge></template>
      <template #cell-result="{ row }"><span class="block max-w-64 break-all text-xs text-muted-foreground">{{ row.status === "SUCCESS" ? row.messageId || "-" : "发送失败，详见 Workers Observability。" }}</span></template>
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetPushLogs } from "@/server/push/admin.telefunc";

type PushLog = Awaited<ReturnType<typeof onGetPushLogs>>["logs"][number];
const columns: AdminTableColumn<PushLog>[] = [
  { key: "createdAt", label: "时间" }, { key: "channel", label: "渠道" }, { key: "scene", label: "场景" }, { key: "provider", label: "Provider" },
  { key: "recipient", label: "收件人" }, { key: "subject", label: "主题" }, { key: "status", label: "状态" }, { key: "result", label: "结果" },
];
const logs = ref<PushLog[]>([]);
const channel = ref<"ALL" | "EMAIL" | "WECOM" | "TELEGRAM">("ALL");
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
    const result = await runTelefunc(() => onGetPushLogs({ page: page.value, pageSize: pageSize.value, ...(channel.value !== "ALL" ? { channel: channel.value } : {}), ...(status.value !== "ALL" ? { status: status.value } : {}) }), { notifyError: false });
    logs.value = result.logs;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; }
}
function resetAndLoad() { page.value = 1; void loadLogs(); }
function changePage(value: number) { page.value = value; void loadLogs(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadLogs(); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function channelLabel(value: PushLog["channel"]) { return { EMAIL: "电子邮件", WECOM: "企业微信", TELEGRAM: "Telegram" }[value]; }
function sceneLabel(value: PushLog["scene"]) { return { TEST: "测试", ORDER_PAID: "支付成功", DELIVERY_SUCCESS: "发货成功", DELIVERY_FAILED: "发货失败" }[value]; }
onMounted(loadLogs);
</script>
