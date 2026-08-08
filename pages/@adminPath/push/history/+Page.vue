<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>无法读取发送日志</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
    <AdminDataTable :columns="columns" :rows="logs" row-key="id" empty-text="没有符合条件的推送记录。">
      <template #toolbar>
        <Select v-model="channel" @update:model-value="resetAndLoad"><SelectTrigger size="sm" class="min-w-28" aria-label="按渠道筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部渠道</SelectItem><SelectItem value="EMAIL">电子邮件</SelectItem><SelectItem value="WECHAT">微信</SelectItem><SelectItem value="TELEGRAM">Telegram</SelectItem></SelectContent></Select>
        <Select v-model="messageType" @update:model-value="resetAndLoad"><SelectTrigger size="sm" class="min-w-28" aria-label="按消息类型筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部类型</SelectItem><SelectItem value="NORMAL">客户消息</SelectItem><SelectItem value="ADMIN">管理消息</SelectItem></SelectContent></Select>
        <Select v-model="scene" @update:model-value="resetAndLoad"><SelectTrigger size="sm" class="min-w-28" aria-label="按场景筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部场景</SelectItem><SelectItem value="ORDER_PAID">支付成功</SelectItem><SelectItem value="DELIVERY_SUCCESS">发货成功</SelectItem><SelectItem value="DELIVERY_FAILED">发货失败</SelectItem></SelectContent></Select>
        <Input v-model="orderNo" class="h-8 w-36" placeholder="订单号" @change="resetAndLoad" />
        <Input v-model.number="orderId" class="h-8 w-28" placeholder="订单 ID" inputmode="numeric" @change="resetAndLoad" />
        <Input v-model="from" class="h-8 w-36" type="datetime-local" aria-label="开始时间" @change="resetAndLoad" />
        <Input v-model="to" class="h-8 w-36" type="datetime-local" aria-label="结束时间" @change="resetAndLoad" />
        <Select v-model="status" @update:model-value="resetAndLoad"><SelectTrigger size="sm" class="min-w-28" aria-label="按状态筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="PENDING">等待发送</SelectItem><SelectItem value="SUCCESS">成功</SelectItem><SelectItem value="FAILED">失败</SelectItem><SelectItem value="SKIPPED">已跳过</SelectItem><SelectItem value="EXHAUSTED">重试耗尽</SelectItem></SelectContent></Select>
        <Button variant="outline" size="icon-sm" :disabled="loading" aria-label="刷新数据" title="刷新数据" @click="loadLogs"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" /></Button>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #cell-channel="{ row }"><Badge variant="outline">{{ channelLabel(row.channel) }}</Badge></template>
      <template #cell-messageType="{ row }"><Badge variant="outline">{{ row.messageType === "ADMIN" ? "管理" : "客户" }}</Badge></template>
      <template #cell-scene="{ row }"><span class="font-mono text-xs">{{ sceneLabel(row.scene) }}</span></template>
      <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo || "-" }}</span></template>

      <template #cell-recipient="{ value }"><span class="block max-w-52 truncate">{{ value }}</span></template>
      <template #cell-subject="{ value }"><span class="block max-w-52 truncate">{{ value || "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'SUCCESS' ? 'secondary' : row.status === 'FAILED' || row.status === 'EXHAUSTED' ? 'destructive' : 'outline'">{{ statusLabel(row.status) }}</Badge></template>
      <template #cell-result="{ row }"><span class="block max-w-64 break-all text-xs text-muted-foreground">{{ row.status === "SUCCESS" ? row.messageId || "-" : row.error || "-" }}</span></template>
      <template #actions="{ row }"><Button v-if="row.channel === 'EMAIL' && (row.status === 'FAILED' || row.status === 'EXHAUSTED')" variant="outline" size="sm" :disabled="retryingId === row.id" @click="retryLog(row.id)"><RefreshCwIcon :class="retryingId === row.id ? 'animate-spin' : ''" />重试</Button><span v-else class="text-muted-foreground">-</span></template>
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
import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetPushLogs, onRetryPushLog } from "@/server/push/admin.telefunc";

type PushLog = Awaited<ReturnType<typeof onGetPushLogs>>["logs"][number];
const columns: AdminTableColumn<PushLog>[] = [
  { key: "createdAt", label: "时间" }, { key: "channel", label: "渠道" }, { key: "messageType", label: "类型" }, { key: "scene", label: "场景" }, { key: "orderNo", label: "订单号" }, { key: "provider", label: "Provider" },
  { key: "recipient", label: "收件人" }, { key: "subject", label: "主题" }, { key: "status", label: "状态" }, { key: "result", label: "结果" },
];
const logs = ref<PushLog[]>([]);
const channel = ref<"ALL" | "EMAIL" | "WECHAT" | "TELEGRAM">("ALL");
const messageType = ref<"ALL" | "NORMAL" | "ADMIN">("ALL");
const scene = ref<"ALL" | "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED">("ALL");
const status = ref<"ALL" | "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED" | "EXHAUSTED">("ALL");
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const orderId = ref<number | undefined>();
const orderNo = ref("");
const from = ref("");
const to = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const retryingId = ref<number | null>(null);
async function loadLogs() {
  loading.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onGetPushLogs({ page: page.value, pageSize: pageSize.value, ...(channel.value !== "ALL" ? { channel: channel.value } : {}), ...(messageType.value !== "ALL" ? { messageType: messageType.value } : {}), ...(scene.value !== "ALL" ? { scene: scene.value } : {}), ...(status.value !== "ALL" ? { status: status.value } : {}), ...(orderId.value ? { orderId: orderId.value } : {}), ...(orderNo.value.trim() ? { orderNo: orderNo.value.trim() } : {}), ...(from.value ? { from: new Date(from.value).toISOString() } : {}), ...(to.value ? { to: new Date(to.value).toISOString() } : {}) }), { notifyError: false });
    logs.value = result.logs;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; }
}
async function retryLog(id: number) {
  retryingId.value = id;
  try { await runTelefunc(() => onRetryPushLog(id), { successMessage: "已加入重试队列。" }); await loadLogs(); } finally { retryingId.value = null; }
}
function resetAndLoad() { page.value = 1; void loadLogs(); }
function changePage(value: number) { page.value = value; void loadLogs(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadLogs(); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function channelLabel(value: PushLog["channel"]) { return { EMAIL: "电子邮件", WECHAT: "微信", TELEGRAM: "Telegram" }[value]; }
function sceneLabel(value: PushLog["scene"]) { return { TEST: "测试", ORDER_PAID: "支付成功", DELIVERY_SUCCESS: "发货成功", DELIVERY_FAILED: "发货失败" }[value]; }
function statusLabel(value: PushLog["status"]) { return { PENDING: "等待发送", PROCESSING: "发送中", SUCCESS: "成功", FAILED: "失败", SKIPPED: "已跳过", EXHAUSTED: "重试耗尽" }[value]; }
onMounted(loadLogs);
</script>
