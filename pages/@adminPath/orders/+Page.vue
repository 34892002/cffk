<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <AdminDataTable :columns="columns" :rows="orders" row-key="id" empty-text="没有符合条件的订单。">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="filters.query" class="h-8 w-56" placeholder="按订单号搜索" @keyup.enter="resetAndLoad" />
          <Select :model-value="filters.status || 'ALL'" @update:model-value="filters.status = $event === 'ALL' ? '' : $event as Order['status']"><SelectTrigger size="sm" class="w-36 shrink-0"><SelectValue placeholder="全部订单状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部订单状态</SelectItem><SelectItem value="PENDING">待支付</SelectItem><SelectItem value="PAID">已支付</SelectItem><SelectItem value="DELIVERED">已交付</SelectItem><SelectItem value="CLOSED">已关闭</SelectItem><SelectItem value="FAILED">失败</SelectItem></SelectContent></Select>
          <Select :model-value="filters.deliveryStatus || 'ALL'" @update:model-value="filters.deliveryStatus = $event === 'ALL' ? '' : $event as Order['deliveryStatus']"><SelectTrigger size="sm" class="w-36 shrink-0"><SelectValue placeholder="全部交付状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部交付状态</SelectItem><SelectItem value="NOT_DELIVERED">未交付</SelectItem><SelectItem value="DELIVERING">交付中</SelectItem><SelectItem value="DELIVERED">已交付</SelectItem><SelectItem value="FAILED">交付失败</SelectItem></SelectContent></Select>
          <div class="w-64 shrink-0"><DateRangePicker v-model="dateRange" /></div>
          <Button size="sm" @click="resetAndLoad">查询</Button>
          <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
        </div>
        <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadOrders"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
      </template>
      <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo }}</span></template>
      <template #cell-productName="{ value }"><span class="font-medium">{{ value }}</span></template>
      <template #cell-quantity="{ value }"><span>{{ value }}</span></template>
      <template #cell-contactValue="{ value }"><span class="text-sm text-muted-foreground">{{ value || "-" }}</span></template>
      <template #cell-amount="{ row }">¥{{ row.amount }}</template>
      <template #cell-payment="{ row }"><Badge :variant="row.paymentStatus === 'PAID' ? 'secondary' : 'outline'">{{ paymentLabel(row.paymentStatus) }}</Badge></template>
      <template #cell-delivery="{ row }"><Badge :variant="row.deliveryStatus === 'FAILED' ? 'destructive' : row.deliveryStatus === 'DELIVERED' ? 'secondary' : 'outline'">{{ deliveryLabel(row.deliveryStatus) }}</Badge></template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="showDetail(row.id)">查看</Button><Button v-if="row.status === 'PENDING'" variant="ghost" size="sm" @click="closeOrder(row.id)">关闭</Button><Button v-if="row.paymentStatus === 'PAID' && row.deliveryStatus !== 'DELIVERED'" variant="ghost" size="sm" @click="openDelivery(row.id)">处理交付</Button></template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>

    <Dialog v-model:open="detailOpen">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader class="border-b px-6 py-5 pr-14"><DialogTitle>订单详情</DialogTitle><DialogDescription v-if="detail" class="font-mono">{{ detail.order.orderNo }}</DialogDescription></DialogHeader>
        <div v-if="detail" class="grid min-h-0 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-2"><div class="grid content-start gap-3 text-sm"><p><span class="text-muted-foreground">商品：</span>{{ detail.order.productNameSnapshot }}</p><p><span class="text-muted-foreground">联系方式：</span>{{ detail.order.contactType }} / {{ detail.order.contactValue || "-" }}</p><p><span class="text-muted-foreground">收件信息：</span>{{ detail.order.receiverInfo || "-" }}</p><p><span class="text-muted-foreground">备注：</span>{{ detail.order.buyerNote || "-" }}</p><p><span class="text-muted-foreground">优惠码：</span>{{ detail.order.discountCodeStr || "-" }}</p></div><div class="grid content-start gap-5"><div><p class="text-sm font-medium">交付快照</p><pre class="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">{{ detail.deliveries.length ? detail.deliveries.map((item) => item.contentSnapshot).join("\n") : "暂无成功交付快照" }}</pre></div><div><p class="text-sm font-medium">支付日志</p><div class="mt-2 grid gap-2 text-xs text-muted-foreground"><p v-for="item in detail.payments" :key="item.id">{{ formatDate(item.createdAt) }} · {{ item.verifyStatus }} · {{ item.message || item.eventType }}</p><p v-if="!detail.payments.length">暂无支付日志</p></div></div></div></div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deliveryOpen" @update:open="onDeliveryOpenChange">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b px-6 py-5 pr-14"><DialogTitle>处理交付</DialogTitle><DialogDescription>人工或物流订单填写发货内容；自动卡密订单执行恢复交付。</DialogDescription></DialogHeader>
        <div class="min-h-0 overflow-y-auto px-6 py-5"><label class="grid gap-2 text-sm font-medium">交付内容<Textarea v-model="deliveryContent" rows="6" class="min-h-28 w-full" placeholder="人工发货说明、物流单号或物流信息" /></label><p class="mt-3 text-xs text-muted-foreground">标记失败不会占用成功交付快照，修正内容后可再次完成发货。</p></div>
        <DialogFooter class="flex flex-wrap border-t px-6 py-4"><Button :disabled="delivering" @click="completeDelivery">确认交付</Button><Button variant="outline" :disabled="delivering" @click="retryAutomatic">重试自动交付</Button><Button variant="destructive" :disabled="delivering" @click="markDeliveryFailed">标记交付失败</Button><Button variant="ghost" :disabled="delivering" @click="closeDelivery">取消</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCwIcon } from "@lucide/vue";
import { userErrorMessage, runTelefunc } from "@/lib/telefunc-client";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { onCloseAdminOrder, onGetAdminOrderDetail, onGetAdminOrders, onRecordManualDelivery, onRetryAutomaticDelivery } from "@/server/order/admin.telefunc";

type Order = Awaited<ReturnType<typeof onGetAdminOrders>>["orders"][number];
const timezone = useSiteTimezone();
type Detail = Awaited<ReturnType<typeof onGetAdminOrderDetail>>;
const columns: AdminTableColumn<Order>[] = [
  { key: "orderNo", label: "订单" }, { key: "productName", label: "商品" }, { key: "quantity", label: "数量" }, { key: "contactValue", label: "联系方式" }, { key: "amount", label: "金额" }, { key: "payment", label: "支付" }, { key: "delivery", label: "交付" }, { key: "createdAt", label: "创建时间" },
];
const orders = ref<Order[]>([]); const detail = ref<Detail | null>(null); const detailOpen = ref(false); const loading = ref(false); const delivering = ref(false); const error = ref<string | null>(null); const page = ref(1); const pageSize = ref(20); const total = ref(0); const deliveryOpen = ref(false); const deliveryOrderId = ref<number | null>(null); const deliveryContent = ref("");
const filters = reactive<{ query: string; status: "" | Order["status"]; deliveryStatus: "" | Order["deliveryStatus"]; startDate: string; endDate: string }>({ query: "", status: "", deliveryStatus: "", startDate: "", endDate: "" });
const dateRange = computed({ get: () => ({ start: filters.startDate, end: filters.endDate }), set: (value: { start: string; end: string }) => { filters.startDate = value.start; filters.endDate = value.end; } });
async function loadOrders() { loading.value = true; error.value = null; try { const result = await runTelefunc(() => onGetAdminOrders({ page: page.value, pageSize: pageSize.value, ...(filters.query ? { query: filters.query } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.deliveryStatus ? { deliveryStatus: filters.deliveryStatus } : {}), ...(filters.startDate ? { startDate: filters.startDate } : {}), ...(filters.endDate ? { endDate: filters.endDate } : {}) }), { notifyError: false }); orders.value = result.orders; total.value = result.total; page.value = result.page; } catch (cause) { error.value = userErrorMessage(cause, "读取订单失败，请稍后重试。"); } finally { loading.value = false; } }
async function showDetail(orderId: number) { try { detail.value = await runTelefunc(() => onGetAdminOrderDetail({ orderId }), { notifyError: false }); detailOpen.value = true; } catch (cause) { error.value = userErrorMessage(cause); } }
async function closeOrder(orderId: number) { try { await runTelefunc(() => onCloseAdminOrder({ orderId }), { successMessage: "订单已关闭，已释放预占资源。" }); await loadOrders(); if (detail.value?.order.id === orderId) await showDetail(orderId); } catch (cause) { error.value = userErrorMessage(cause, "该订单当前不能关闭。"); } }
function openDelivery(orderId: number) { deliveryOrderId.value = orderId; deliveryContent.value = ""; deliveryOpen.value = true; }
function closeDelivery() { deliveryOpen.value = false; deliveryOrderId.value = null; deliveryContent.value = ""; }
function onDeliveryOpenChange(open: boolean) { if (!open && !delivering.value) closeDelivery(); }
async function completeDelivery() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value }), { successMessage: "订单已完成交付。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "无法完成交付，请检查订单状态和内容。"); } finally { delivering.value = false; } }
async function markDeliveryFailed() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value, failed: true }), { successMessage: "已标记交付失败。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "无法更新交付状态。"); } finally { delivering.value = false; } }
async function retryAutomatic() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRetryAutomaticDelivery({ orderId: deliveryOrderId.value! }), { successMessage: "自动交付已完成。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "自动交付尚未完成，请检查订单和卡密库存。"); } finally { delivering.value = false; } }
function resetAndLoad() { page.value = 1; void loadOrders(); }
function resetFilters() { Object.assign(filters, { query: "", status: "", deliveryStatus: "", startDate: "", endDate: "" }); resetAndLoad(); }
function changePage(value: number) { page.value = value; void loadOrders(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadOrders(); }

function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value); }
function paymentLabel(value: Order["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[value]; }
function deliveryLabel(value: Order["deliveryStatus"]) { return { NOT_DELIVERED: "未交付", DELIVERING: "交付中", DELIVERED: "已交付", FAILED: "交付失败" }[value]; }
onMounted(loadOrders);
</script>
