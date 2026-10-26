<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>无法读取发送日志</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Tabs default-value="logs" class="gap-4">
      <TabsList>
        <TabsTrigger value="logs">发送日志</TabsTrigger>
        <TabsTrigger value="queue">待发送队列（{{ queued.length }}）</TabsTrigger>
      </TabsList>
      <TabsContent value="logs">
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
      </TabsContent>
      <TabsContent value="queue">
        <div class="grid gap-3">
          <div>
            <h2 class="text-base font-semibold tracking-normal">待发送队列（{{ queued.length }}）</h2>
            <p class="mt-1 text-sm text-muted-foreground">这些订单通知已写入队列，但还没有被定时任务处理。线上 Worker 每分钟处理一次；本地开发不会自动执行定时任务。可以手动发送或删除。</p>
          </div>
          <AdminDataTable :columns="queueColumns" :rows="queued" row-key="id" empty-text="当前没有待发送的队列通知。">
            <template #cell-availableAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.availableAt) }}</span></template>
            <template #cell-messageType="{ row }"><Badge variant="outline">{{ queueMessageType(row.scene) }}</Badge></template>
            <template #cell-scene="{ row }"><span class="font-mono text-xs">{{ sceneLabel(row.scene) }}</span></template>
            <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo || "-" }}</span></template>
            <template #cell-recipient="{ row }"><span class="block max-w-52 truncate">{{ row.contactValue || "-" }}</span></template>
            <template #cell-status="{ row }"><Badge variant="outline" class="border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400">{{ row.status === "PROCESSING" ? "处理中" : "排队中" }}</Badge></template>
            <template #cell-result="{ row }"><span class="block max-w-64 break-all text-xs text-muted-foreground">{{ row.errorMessage || (row.attemptCount > 0 ? `已尝试 ${row.attemptCount} 次` : "等待定时任务处理") }}</span></template>
            <template #actions="{ row }">
              <div class="flex justify-end gap-1">
                <Button size="sm" variant="outline" :disabled="sendingQueueId === row.id" @click="sendQueued(row.id)">{{ sendingQueueId === row.id ? "发送中..." : "发送" }}</Button>
                <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :disabled="deletingQueueId === row.id || row.status === 'PROCESSING'" @click="requestDeleteQueued(row)">{{ deletingQueueId === row.id ? "删除中..." : "删除" }}</Button>
              </div>
            </template>
          </AdminDataTable>
        </div>
      </TabsContent>
    </Tabs>

    <Dialog :open="deleteDialogOpen" @update:open="(open) => { deleteDialogOpen = open; if (!open) queueToDelete = null; }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>删除待发送通知？</DialogTitle>
          <DialogDescription>
            订单 {{ queueToDelete?.orderNo || "-" }} 的{{ queueToDelete ? sceneLabel(queueToDelete.scene) : "通知" }}将从队列中删除，之后不会再发送。此操作无法撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline" :disabled="deletingQueueId !== null">取消</Button></DialogClose>
          <Button type="button" variant="destructive" :disabled="deletingQueueId !== null" @click="confirmDeleteQueued">{{ deletingQueueId !== null ? "删除中..." : "确认删除" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onDeleteQueuedPush, onGetPushLogs, onRetryPushLog, onSendQueuedPush } from "@/server/push/admin.telefunc";
import type { PushScene } from "@/server/push/types";
import { dateBoundaryInTimezone, formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { DateRangePicker } from "@/components/ui/date-range-picker";

type PushLog = Awaited<ReturnType<typeof onGetPushLogs>>["logs"][number];
type QueuedEvent = Awaited<ReturnType<typeof onGetPushLogs>>["queued"][number];
const timezone = useSiteTimezone();
const columns: AdminTableColumn<PushLog>[] = [
  { key: "createdAt", label: "时间" }, { key: "channel", label: "渠道" }, { key: "messageType", label: "类型" }, { key: "scene", label: "场景" }, { key: "orderNo", label: "订单号" }, { key: "provider", label: "Provider" },
  { key: "recipient", label: "收件人" }, { key: "subject", label: "主题" }, { key: "status", label: "状态" }, { key: "result", label: "结果" },
];
const queueColumns: AdminTableColumn<QueuedEvent>[] = [
  { key: "availableAt", label: "可发送时间" }, { key: "messageType", label: "类型" }, { key: "scene", label: "场景" }, { key: "orderNo", label: "订单号" }, { key: "recipient", label: "客户邮箱" }, { key: "status", label: "状态" }, { key: "result", label: "说明" },
];
const logs = ref<PushLog[]>([]);
const queued = ref<QueuedEvent[]>([]);
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
const sendingQueueId = ref<number | null>(null);
const deletingQueueId = ref<number | null>(null);
const deleteDialogOpen = ref(false);
const queueToDelete = ref<QueuedEvent | null>(null);
async function loadLogs() {
  loading.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onGetPushLogs({ page: page.value, pageSize: pageSize.value, ...(channel.value !== "ALL" ? { channel: channel.value } : {}), ...(messageType.value !== "ALL" ? { messageType: messageType.value } : {}), ...(scene.value !== "ALL" ? { scene: scene.value } : {}), ...(status.value !== "ALL" ? { status: status.value } : {}), ...(orderNo.value.trim() ? { orderNo: orderNo.value.trim() } : {}), ...(dateRange.value.start ? { from: dateBoundaryInTimezone(dateRange.value.start, timezone.value).toISOString() } : {}), ...(dateRange.value.end ? { to: dateBoundaryInTimezone(dateRange.value.end, timezone.value, true).toISOString() } : {}) }), { notifyError: false });
    logs.value = result.logs;
    queued.value = result.queued;
    total.value = result.total;
    page.value = result.page;
  } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; }
}
async function retryLog(id: number) {
  retryingId.value = id;
  try { await runTelefunc(() => onRetryPushLog(id), { successMessage: "已加入重试队列。" }); await loadLogs(); } finally { retryingId.value = null; }
}
async function sendQueued(id: number) {
  sendingQueueId.value = id;
  try {
    const result = await runTelefunc(() => onSendQueuedPush({ id }), { notifyError: false });
    if (result.status === "processed") toast.success("队列通知已发送。");
    else if (result.status === "already_processed") toast.success("该通知已处理。");
    else if (result.status === "failed") toast.error(`发送失败：${result.error || "请查看发送日志"}`);
    else if (result.status === "busy") toast.error("该通知正在处理中，请稍后再试。");
    else toast.error("队列项不存在。");
    await loadLogs();
  } catch (cause) { toast.error(userErrorMessage(cause)); } finally { sendingQueueId.value = null; }
}
function requestDeleteQueued(row: QueuedEvent) {
  queueToDelete.value = row;
  deleteDialogOpen.value = true;
}
async function confirmDeleteQueued() {
  const row = queueToDelete.value;
  if (!row) return;
  deletingQueueId.value = row.id;
  try {
    const result = await runTelefunc(() => onDeleteQueuedPush({ id: row.id }), { notifyError: false });
    if (result.deleted) {
      toast.success("队列通知已删除。");
      deleteDialogOpen.value = false;
      queueToDelete.value = null;
      await loadLogs();
    } else {
      toast.error("该通知已处理或正在发送，无法删除。");
    }
  } catch (cause) { toast.error(userErrorMessage(cause)); } finally { deletingQueueId.value = null; }
}
function search() { page.value = 1; void loadLogs(); }
function resetFilters() { channel.value = "ALL"; messageType.value = "ALL"; scene.value = "ALL"; status.value = "ALL"; orderNo.value = ""; dateRange.value = { start: "", end: "" }; search(); }
function changePage(value: number) { page.value = value; void loadLogs(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadLogs(); }
function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value, { dateStyle: "short", timeStyle: "medium" }); }
function channelLabel(value: PushLog["channel"]) { return { EMAIL: "电子邮件", WECHAT: "微信", TELEGRAM: "Telegram" }[value]; }
function sceneLabel(value: string) {
  return sceneOptions.find((item) => item.value === value)?.label ?? value;
}
function statusLabel(value: PushLog["status"]) { return { PENDING: "等待发送", PROCESSING: "发送中", SUCCESS: "成功", FAILED: "失败", SKIPPED: "已跳过", EXHAUSTED: "重试耗尽" }[value]; }
function queueMessageType(scene: QueuedEvent["scene"]) { return scene === "DELIVERY_FAILED" || scene === "PAYMENT_EXCEPTION" ? "管理" : "客户+管理"; }
onMounted(loadLogs);
</script>
