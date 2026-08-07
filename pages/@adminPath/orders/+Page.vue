<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <AdminDataTable :columns="columns" :rows="orders" row-key="id" empty-text="没有符合条件的订单。">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="filters.query" class="h-8 w-56" placeholder="按订单号搜索" @keyup.enter="resetAndLoad" />
          <Select :model-value="filters.status || 'ALL'" @update:model-value="filters.status = $event === 'ALL' ? '' : $event as Order['status']; resetAndLoad()"><SelectTrigger size="sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部订单状态</SelectItem><SelectItem value="PENDING">待支付</SelectItem><SelectItem value="PAID">已支付</SelectItem><SelectItem value="DELIVERED">已交付</SelectItem><SelectItem value="CLOSED">已关闭</SelectItem><SelectItem value="FAILED">失败</SelectItem></SelectContent></Select>
          <Select :model-value="filters.deliveryStatus || 'ALL'" @update:model-value="filters.deliveryStatus = $event === 'ALL' ? '' : $event as Order['deliveryStatus']; resetAndLoad()"><SelectTrigger size="sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部交付状态</SelectItem><SelectItem value="NOT_DELIVERED">未交付</SelectItem><SelectItem value="DELIVERED">已交付</SelectItem><SelectItem value="FAILED">交付失败</SelectItem></SelectContent></Select>
          <Button variant="outline" size="sm" @click="resetAndLoad">查询</Button>
        </div>
        <Button variant="outline" size="icon-sm" :disabled="loading" aria-label="刷新数据" title="刷新数据" @click="loadOrders"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" /></Button>
      </template>
      <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo }}</span></template>
      <template #cell-productName="{ value }"><span class="font-medium">{{ value }}</span></template>
      <template #cell-quantity="{ value }"><span>{{ value }}</span></template>
      <template #cell-contactValue="{ value }"><span class="text-sm text-muted-foreground">{{ value || "-" }}</span></template>
      <template #cell-amount="{ row }">{{ formatAmount(row.amount) }}</template>
      <template #cell-payment="{ row }"><Badge :variant="row.paymentStatus === 'PAID' ? 'secondary' : 'outline'">{{ paymentLabel(row.paymentStatus) }}</Badge></template>
      <template #cell-delivery="{ row }"><Badge :variant="row.deliveryStatus === 'FAILED' ? 'destructive' : row.deliveryStatus === 'DELIVERED' ? 'secondary' : 'outline'">{{ deliveryLabel(row.deliveryStatus) }}</Badge></template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="showDetail(row.id)">查看</Button><Button v-if="row.status === 'PENDING'" variant="ghost" size="sm" @click="closeOrder(row.id)">关闭</Button><Button v-if="row.paymentStatus === 'PAID' && row.deliveryStatus !== 'DELIVERED'" variant="ghost" size="sm" @click="openDelivery(row.id)">处理交付</Button></template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>

    <Card v-if="detail"><CardHeader><div class="flex flex-wrap justify-between gap-3"><div><CardTitle>订单详情</CardTitle><CardDescription class="mt-1 font-mono">{{ detail.order.orderNo }}</CardDescription></div><Button variant="outline" @click="detail = null">关闭详情</Button></div></CardHeader><CardContent class="grid gap-6 lg:grid-cols-2"><div class="grid gap-3 text-sm"><p><span class="text-muted-foreground">商品：</span>{{ detail.order.productNameSnapshot }}</p><p><span class="text-muted-foreground">联系方式：</span>{{ detail.order.contactType }} / {{ detail.order.contactValue || "-" }}</p><p><span class="text-muted-foreground">收件信息：</span>{{ detail.order.receiverInfo || "-" }}</p><p><span class="text-muted-foreground">备注：</span>{{ detail.order.buyerNote || "-" }}</p><p><span class="text-muted-foreground">优惠码：</span>{{ detail.order.discountCodeStr || "-" }}</p></div><div class="grid gap-3"><div><p class="text-sm font-medium">交付快照</p><pre class="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">{{ detail.deliveries.length ? detail.deliveries.map((item) => item.contentSnapshot).join("\n") : "暂无成功交付快照" }}</pre></div><div><p class="text-sm font-medium">支付日志</p><div class="mt-2 grid gap-2 text-xs text-muted-foreground"><p v-for="item in detail.payments" :key="item.id">{{ formatDate(item.createdAt) }} · {{ item.verifyStatus }} · {{ item.message || item.eventType }}</p><p v-if="!detail.payments.length">暂无支付日志</p></div></div></div></CardContent></Card>

    <Card v-if="deliveryOrderId"><CardHeader><CardTitle>处理交付</CardTitle><CardDescription>人工或物流订单填写发货内容；自动卡密订单执行恢复交付。</CardDescription></CardHeader><CardContent class="grid max-w-3xl gap-4"><label class="grid gap-2 text-sm font-medium">交付内容<Textarea v-model="deliveryContent" rows="6" class="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="人工发货说明、物流单号或物流信息" /></label><p class="text-xs text-muted-foreground">标记失败不会占用成功交付快照，修正内容后可再次完成发货。</p></CardContent><CardFooter class="flex flex-wrap gap-2"><Button :disabled="delivering" @click="completeDelivery">确认交付</Button><Button variant="outline" :disabled="delivering" @click="retryAutomatic">重试自动交付</Button><Button variant="destructive" :disabled="delivering" @click="markDeliveryFailed">标记交付失败</Button><Button variant="ghost" @click="closeDelivery">取消</Button></CardFooter></Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCwIcon } from "@lucide/vue";
import { userErrorMessage, runTelefunc } from "@/lib/telefunc-client";
import { onCloseAdminOrder, onGetAdminOrderDetail, onGetAdminOrders, onRecordManualDelivery, onRetryAutomaticDelivery } from "@/server/order/admin.telefunc";

type Order = Awaited<ReturnType<typeof onGetAdminOrders>>["orders"][number];
type Detail = Awaited<ReturnType<typeof onGetAdminOrderDetail>>;
const columns: AdminTableColumn<Order>[] = [
  { key: "orderNo", label: "订单" }, { key: "productName", label: "商品" }, { key: "quantity", label: "数量" }, { key: "contactValue", label: "联系方式" }, { key: "amount", label: "金额" }, { key: "payment", label: "支付" }, { key: "delivery", label: "交付" }, { key: "createdAt", label: "创建时间" },
];
const orders = ref<Order[]>([]); const detail = ref<Detail | null>(null); const loading = ref(false); const delivering = ref(false); const error = ref<string | null>(null); const page = ref(1); const pageSize = ref(20); const total = ref(0); const deliveryOrderId = ref<number | null>(null); const deliveryContent = ref("");
const filters = reactive<{ query: string; status: "" | Order["status"]; deliveryStatus: "" | Order["deliveryStatus"] }>({ query: "", status: "", deliveryStatus: "" });
async function loadOrders() { loading.value = true; error.value = null; try { const result = await onGetAdminOrders({ page: page.value, pageSize: pageSize.value, ...(filters.query ? { query: filters.query } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.deliveryStatus ? { deliveryStatus: filters.deliveryStatus } : {}) }); orders.value = result.orders; total.value = result.total; page.value = result.page; } catch (cause) { error.value = userErrorMessage(cause, "读取订单失败，请稍后重试。"); } finally { loading.value = false; } }
async function showDetail(orderId: number) { try { detail.value = await onGetAdminOrderDetail({ orderId }); } catch (cause) { error.value = userErrorMessage(cause); } }
async function closeOrder(orderId: number) { try { await runTelefunc(() => onCloseAdminOrder({ orderId }), { successMessage: "订单已关闭，已释放预占资源。" }); await loadOrders(); if (detail.value?.order.id === orderId) await showDetail(orderId); } catch (cause) { error.value = userErrorMessage(cause, "该订单当前不能关闭。"); } }
function openDelivery(orderId: number) { deliveryOrderId.value = orderId; deliveryContent.value = ""; }
function closeDelivery() { deliveryOrderId.value = null; deliveryContent.value = ""; }
async function completeDelivery() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value }), { successMessage: "订单已完成交付。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "无法完成交付，请检查订单状态和内容。"); } finally { delivering.value = false; } }
async function markDeliveryFailed() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value, failed: true }), { successMessage: "已标记交付失败。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "无法更新交付状态。"); } finally { delivering.value = false; } }
async function retryAutomatic() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRetryAutomaticDelivery({ orderId: deliveryOrderId.value! }), { successMessage: "自动交付已完成。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "自动交付尚未完成，请检查订单和卡密库存。"); } finally { delivering.value = false; } }
function resetAndLoad() { page.value = 1; void loadOrders(); }
function changePage(value: number) { page.value = value; void loadOrders(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadOrders(); }
function formatAmount(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value / 100); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function paymentLabel(value: Order["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[value]; }
function deliveryLabel(value: Order["deliveryStatus"]) { return { NOT_DELIVERED: "未交付", DELIVERED: "已交付", FAILED: "交付失败" }[value]; }
onMounted(loadOrders);
</script>
