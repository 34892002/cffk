<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>无法读取发送日志</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
    <AdminDataTable :columns="columns" :rows="logs" row-key="id" empty-text="没有符合条件的推送记录。">
      <template #toolbar>
        <div class="flex flex-1 flex-wrap items-center gap-3">
          <Input v-model="orderNo" class="h-8 w-52 shrink-0" placeholder="订单号" @keyup.enter="search" />
          <Select v-model="channel"><SelectTrigger size="sm" class="w-28 shrink-0" aria-label="按渠道筛选"><SelectValue placeholder="全部渠道" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部渠道</SelectItem><SelectItem value="EMAIL">电子邮件</SelectItem><SelectItem value="WECHAT">微信</SelectItem><SelectItem value="TELEGRAM">Telegram</SelectItem></SelectContent></Select>
          <Select v-model="messageType"><SelectTrigger size="sm" class="w-28 shrink-0" aria-label="按消息类型筛选"><SelectValue placeholder="全部类型" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部类型</SelectItem><SelectItem value="NORMAL">客户消息</SelectItem><SelectItem value="ADMIN">管理消息</SelectItem></SelectContent></Select>
          <Select v-model="scene"><SelectTrigger size="sm" class="w-32 shrink-0" aria-label="按场景筛选"><SelectValue placeholder="全部场景" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部场景</SelectItem><SelectItem v-for="item in sceneOptions" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></Select>
          <Select v-model="status"><SelectTrigger size="sm" class="w-28 shrink-0" aria-label="按状态筛选"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="PENDING">等待发送</SelectItem><SelectItem value="PROCESSING">发送中</SelectItem><SelectItem value="SUCCESS">成功</SelectItem><SelectItem value="FAILED">失败</SelectItem><SelectItem value="SKIPPED">已跳过</SelectItem><SelectItem value="EXHAUSTED">重试耗尽</SelectItem></SelectContent></Select>
          <div class="w-64 shrink-0"><DateRangePicker v-model="dateRange" /></div>
          <div class="flex gap-2"><Button size="sm" :disabled="loading" @click="search">查询</Button><Button variant="outline" size="sm" :disabled="loading" @click="resetFilters">重置</Button></div>
        </div>
        <div class="flex shrink-0"><Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadLogs"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button></div>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #cell-channel="{ row }"><Badge variant="outline">{{ channelLabel(row.channel) }}</Badge></template>
      <template #cell-messageType="{ row }"><Badge variant="outline">{{ row.messageType === "ADMIN" ? "管理" : "客户" }}</Badge></template>
      <template #cell-scene="{ row }"><span class="font-mono text-xs">{{ sceneLabel(row.scene) }}</span></template>
      <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo || "-" }}</span></template>

      <template #cell-recipient="{ value }"><span class="block max-w-52 truncate">{{ value }}</span></template>
      <template #cell-subject="{ value }"><span class="block max-w-52 truncate">{{ value || "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'SUCCESS' ? 'default' : 'outline'" :class="row.status === 'SUCCESS' ? '' : 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'">{{ statusLabel(row.status) }}</Badge></template>
      <template #cell-result="{ row }"><span class="block max-w-64 break-all text-xs text-muted-foreground">{{ row.status === "SUCCESS" ? row.messageId || "-" : row.error || "-" }}</span></template>
      <template #actions="{ row }"><Button v-if="row.status === 'FAILED' || row.status === 'EXHAUSTED'" variant="outline" size="sm" :disabled="retryingId === row.id" @click="retryLog(row.id)"><RefreshCwIcon :class="retryingId === row.id ? 'animate-spin' : ''" />重试</Button><span v-else class="text-muted-foreground">-</span></template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[10, 20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
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
import type { PushScene } from "@/server/push/types";
import { dateBoundaryInTimezone, formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { DateRangePicker } from "@/components/ui/date-range-picker";

type PushLog = Awaited<ReturnType<typeof onGetPushLogs>>["logs"][number];
const timezone = useSiteTimezone();
const columns: AdminTableColumn<PushLog>[] = [
  { key: "createdAt", label: "时间" }, { key: "channel", label: "渠道" }, { key: "messageType", label: "类型" }, { key: "scene", label: "场景" }, { key: "orderNo", label: "订单号" }, { key: "provider", label: "Provider" },
  { key: "recipient", label: "收件人" }, { key: "subject", label: "主题" }, { key: "status", label: "状态" }, { key: "result", label: "结果" },
];
const logs = ref<PushLog[]>([]);
const channel = ref<"ALL" | "EMAIL" | "WECHAT" | "TELEGRAM">("ALL");
const messageType = ref<"ALL" | "NORMAL" | "ADMIN">("ALL");
const sceneOptions: Array<{ value: PushScene; label: string }> = [
  { value: "TEST", label: "测试" },
  { value: "EMAIL_VERIFICATION", label: "邮箱验证" },
  { value: "PASSWORD_RESET", label: "密码找回" },
  { value: "GUEST_ORDER_RECOVERY", label: "Guest 订单恢复" },
  { value: "ORDER_PAID", label: "支付成功" },
  { value: "DELIVERY_SUCCESS", label: "发货成功" },
  { value: "DELIVERY_FAILED", label: "发货失败" },
  { value: "PAYMENT_EXCEPTION", label: "支付异常" },
];
const scene = ref<"ALL" | PushScene>("ALL");
const status = ref<"ALL" | "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "SKIPPED" | "EXHAUSTED">("ALL");
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const orderNo = ref("");
const dateRange = ref({ start: "", end: "" });
const loading = ref(false);
const error = ref<string | null>(null);
const retryingId = ref<number | null>(null);
async function loadLogs() {
  loading.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onGetPushLogs({ page: page.value, pageSize: pageSize.value, ...(channel.value !== "ALL" ? { channel: channel.value } : {}), ...(messageType.value !== "ALL" ? { messageType: messageType.value } : {}), ...(scene.value !== "ALL" ? { scene: scene.value } : {}), ...(status.value !== "ALL" ? { status: status.value } : {}), ...(orderNo.value.trim() ? { orderNo: orderNo.value.trim() } : {}), ...(dateRange.value.start ? { from: dateBoundaryInTimezone(dateRange.value.start, timezone.value).toISOString() } : {}), ...(dateRange.value.end ? { to: dateBoundaryInTimezone(dateRange.value.end, timezone.value, true).toISOString() } : {}) }), { notifyError: false });
    logs.value = result.logs;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; }
}
async function retryLog(id: number) {
  retryingId.value = id;
  try { await runTelefunc(() => onRetryPushLog(id), { successMessage: "已加入重试队列。" }); await loadLogs(); } finally { retryingId.value = null; }
}
function search() { page.value = 1; void loadLogs(); }
function resetFilters() { channel.value = "ALL"; messageType.value = "ALL"; scene.value = "ALL"; status.value = "ALL"; orderNo.value = ""; dateRange.value = { start: "", end: "" }; search(); }
function changePage(value: number) { page.value = value; void loadLogs(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadLogs(); }
function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value, { dateStyle: "short", timeStyle: "medium" }); }
function channelLabel(value: PushLog["channel"]) { return { EMAIL: "电子邮件", WECHAT: "微信", TELEGRAM: "Telegram" }[value]; }
function sceneLabel(value: PushLog["scene"]) {
  return sceneOptions.find((item) => item.value === value)?.label ?? value;
}
function statusLabel(value: PushLog["status"]) { return { PENDING: "等待发送", PROCESSING: "发送中", SUCCESS: "成功", FAILED: "失败", SKIPPED: "已跳过", EXHAUSTED: "重试耗尽" }[value]; }
onMounted(loadLogs);
</script>
