<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />


    <AdminDataTable :columns="columns" :rows="orders" row-key="id" empty-text="没有符合条件的订单。" selectable :selected-keys="selectedIds" :row-selectable="selectableOrder" @update:selected-keys="selectedIds = $event">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="filters.query" class="h-8 w-56" placeholder="按订单号搜索" @keyup.enter="resetAndLoad" />
          <Select :model-value="filters.status || 'ALL'" @update:model-value="filters.status = $event === 'ALL' ? '' : $event as Order['status']"><SelectTrigger size="sm" class="w-36 shrink-0"><SelectValue placeholder="全部订单状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部订单状态</SelectItem><SelectItem value="PENDING">待支付</SelectItem><SelectItem value="PAID">已支付</SelectItem><SelectItem value="DELIVERED">已完成</SelectItem><SelectItem value="CLOSED">已关闭</SelectItem><SelectItem value="FAILED">发货失败</SelectItem></SelectContent></Select>
          <Select :model-value="filters.deliveryStatus || 'ALL'" @update:model-value="filters.deliveryStatus = $event === 'ALL' ? '' : $event as Order['deliveryStatus']"><SelectTrigger size="sm" class="w-36 shrink-0"><SelectValue placeholder="全部发货状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部发货状态</SelectItem><SelectItem value="NOT_DELIVERED">未发货</SelectItem><SelectItem value="DELIVERING">发货中</SelectItem><SelectItem value="DELIVERED">已发货</SelectItem><SelectItem value="FAILED">发货失败</SelectItem></SelectContent></Select>
          <div class="w-64 shrink-0"><DateRangePicker v-model="dateRange" /></div>
          <Button size="sm" @click="resetAndLoad">查询</Button>
          <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span v-if="selectedIds.length" class="text-sm text-muted-foreground">已选 {{ selectedIds.length }} 条</span>
          <Button variant="outline" size="sm" class="border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive" :disabled="loading" @click="requestBulkDelete"><Trash2Icon />批量删除</Button>
          <Button v-if="appliedFilters.status === 'CLOSED' && total > 0" variant="outline" size="sm" class="border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive" :disabled="loading" @click="openActionDialog('DELETE_FILTERED')"><Trash2Icon />删除全部已关闭 ({{ total }})</Button>
          <Button v-if="appliedFilters.status === 'PENDING' && total > 0" variant="outline" size="sm" class="border-orange-500/30 text-orange-600 hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-600 dark:text-orange-400" :disabled="loading" @click="openActionDialog('CLOSE_PENDING')"><BanIcon />关闭全部待支付 ({{ total }})</Button>
          <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadOrders"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
        </div>
      </template>
      <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo }}</span></template>
      <template #cell-productName="{ value }"><span class="font-medium">{{ value }}</span></template>
      <template #cell-quantity="{ value }"><span>{{ value }}</span></template>
      <template #cell-deliveryType="{ value }"><span class="text-sm">{{ deliveryTypeLabel(value) }}</span></template>
      <template #cell-contactValue="{ value }"><span class="text-sm text-muted-foreground">{{ value || "-" }}</span></template>
      <template #cell-amount="{ row }">{{ row.amount }}</template>
      <template #cell-delivery="{ row }"><Badge :variant="row.deliveryStatus === 'FAILED' ? 'destructive' : row.deliveryStatus === 'DELIVERED' ? 'default' : 'secondary'">{{ deliveryLabel(row.deliveryStatus) }}</Badge></template>
      <template #cell-status="{ row }"><Badge :variant="statusVariant(row.status)">{{ statusLabel(row.status) }}</Badge></template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #actions="{ row }"><div class="flex min-w-[22rem] justify-end gap-1"><Button variant="ghost" size="sm" @click="showDetail(row.id)">查看</Button><Button v-if="row.status === 'PENDING'" variant="ghost" size="sm" @click="closeOrder(row.id)">关闭</Button><Button v-if="row.paymentStatus === 'UNPAID'" variant="ghost" size="sm" :disabled="replenishingOrderId === row.id" @click="openReplenish(row)">{{ replenishingOrderId === row.id ? '补单中...' : '补单' }}</Button><Button v-if="row.paymentStatus === 'PAID' && row.deliveryStatus !== 'DELIVERED'" variant="ghost" size="sm" @click="row.deliveryType === 'SUPPLIER' ? retrySupplierOrder(row.id) : openDelivery(row.id)">{{ row.deliveryType === 'SUPPLIER' ? '重试供应商发货' : '处理发货' }}</Button></div></template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[10, 20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>

    <Dialog v-model:open="detailOpen">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader class="border-b px-5 py-4 pr-16 sm:px-6 sm:py-5 sm:pr-20">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div class="min-w-0">
              <DialogTitle>订单详情</DialogTitle>
              <DialogDescription v-if="detail" class="mt-1 break-all font-mono text-xs">{{ detail.order.orderNo }}</DialogDescription>
            </div>
            <div v-if="detail" class="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
              <Badge :variant="statusVariant(detail.order.status)">{{ statusLabel(detail.order.status) }}</Badge>
              <Badge :variant="detail.order.paymentStatus === 'PAID' ? 'secondary' : 'outline'">{{ paymentLabel(detail.order.paymentStatus) }}</Badge>
              <Badge :variant="detail.order.deliveryStatus === 'FAILED' ? 'destructive' : detail.order.deliveryStatus === 'DELIVERED' ? 'secondary' : 'outline'">{{ deliveryLabel(detail.order.deliveryStatus) }}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div v-if="detail" class="@container min-h-0 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          <div class="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)] @3xl:gap-6">
            <div class="grid min-w-0 gap-4">
              <Card class="gap-0 py-0">
                <CardHeader class="border-b px-4 py-4 sm:px-5">
                  <CardTitle class="text-sm">订单信息</CardTitle>
                </CardHeader>
                <CardContent class="p-4 sm:p-5">
                  <dl class="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <div class="min-w-0">
                      <dt class="text-xs text-muted-foreground">商品</dt>
                      <dd class="mt-1 wrap-break-word font-medium">{{ detail.order.productNameSnapshot }}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">数量</dt>
                      <dd class="mt-1 font-medium">{{ detail.order.quantity }}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">优惠券</dt>
                      <dd class="mt-1 font-medium">{{ detail.order.discountCodeStr || "未使用" }}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">订单金额</dt>
                      <dd class="mt-1 text-base font-semibold">{{ detail.order.amount }}</dd>
                    </div>
                    <div v-if="detail.order.currency !== 'CNY'">
                      <dt class="text-xs text-muted-foreground">折合人民币</dt>
                      <dd class="mt-1 font-medium">{{ detail.order.baseAmount }}</dd>
                    </div>
                    <div v-if="detail.order.currency !== 'CNY'">
                      <dt class="text-xs text-muted-foreground">下单汇率</dt>
                      <dd class="mt-1 font-medium">1 CNY = {{ detail.order.exchangeRate }} {{ detail.order.currency }}</dd>
                    </div>
                    <div class="min-w-0 sm:col-span-2">
                      <dt class="text-xs text-muted-foreground">联系方式</dt>
                      <dd class="mt-1 wrap-break-word">{{ detail.order.contactType }} · {{ detail.order.contactValue || "-" }}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card class="gap-0 py-0">
                <CardHeader class="border-b px-4 py-4 sm:px-5">
                  <CardTitle class="text-sm">收货信息</CardTitle>
                </CardHeader>
                <CardContent class="grid gap-5 p-4 text-sm sm:p-5">
                  <div v-if="detail.order.addressSnapshot" class="grid gap-4 leading-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                    <div class="min-w-0">
                      <p class="text-xs text-muted-foreground">收货人</p>
                      <p class="mt-1 wrap-break-word font-medium">{{ detail.order.addressSnapshot.recipientName }}</p>
                      <p class="wrap-break-word text-muted-foreground">{{ detail.order.addressSnapshot.phone }}</p>
                    </div>
                    <div class="min-w-0">
                      <p class="text-xs text-muted-foreground">收货地址</p>
                      <p class="mt-1 wrap-break-word">{{ detail.order.addressSnapshot.country }} {{ detail.order.addressSnapshot.province }} {{ detail.order.addressSnapshot.city }} {{ detail.order.addressSnapshot.district }} {{ detail.order.addressSnapshot.addressLine }}</p>
                      <p v-if="detail.order.addressSnapshot.postalCode" class="text-xs text-muted-foreground">邮编：{{ detail.order.addressSnapshot.postalCode }}</p>
                    </div>
                  </div>
                  <p v-else class="text-muted-foreground">此订单无需收货地址</p>
                  <dl class="border-t pt-5">
                    <div class="min-w-0">
                      <dt class="text-xs text-muted-foreground">买家备注</dt>
                      <dd class="mt-1 whitespace-pre-wrap wrap-break-word">{{ detail.order.buyerNote || "无" }}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>

            <div class="grid min-w-0 gap-4">
              <Card class="gap-0 py-0">
                <CardHeader class="border-b px-4 py-4 sm:px-5">
                  <div class="flex items-center justify-between gap-3">
                    <CardTitle class="text-sm">发货内容</CardTitle>
                    <Badge variant="outline">{{ deliveryContents.length }} 条</Badge>
                  </div>
                </CardHeader>
                <CardContent class="p-4 sm:p-5">
                  <div v-if="deliveryContents.length" class="grid max-h-64 gap-2 overflow-y-auto">
                    <pre v-for="(content, index) in deliveryContents" :key="index" class="whitespace-pre-wrap wrap-break-word rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">{{ content }}</pre>
                  </div>
                  <p v-else class="text-sm text-muted-foreground">暂无成功发货内容</p>
                </CardContent>
              </Card>

              <Card class="gap-0 py-0">
                <CardHeader class="border-b px-4 py-4 sm:px-5">
                  <div class="flex items-center justify-between gap-3">
                    <CardTitle class="text-sm">支付日志</CardTitle>
                    <Badge variant="outline">{{ detail.payments.length }} 条</Badge>
                  </div>
                </CardHeader>
                <CardContent class="p-4 sm:p-5">
                  <div v-if="detail.payments.length" class="grid max-h-80 gap-3 overflow-y-auto">
                    <div v-for="item in detail.payments" :key="item.id" class="rounded-md border bg-muted/30 p-3 text-xs">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <time class="text-muted-foreground">{{ formatDate(item.createdAt) }}</time>
                        <Badge variant="outline" class="font-normal">{{ item.verifyStatus }}</Badge>
                      </div>
                      <p class="mt-2 wrap-break-word font-medium leading-5">{{ item.message || item.eventType }}</p>
                    </div>
                  </div>
                  <p v-else class="text-sm text-muted-foreground">暂无支付日志</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deliveryOpen" @update:open="onDeliveryOpenChange">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b px-6 py-5 pr-14"><DialogTitle>处理发货</DialogTitle><DialogDescription>人工或物流订单填写发货内容；自动卡密订单执行恢复发货。</DialogDescription></DialogHeader>
        <div class="min-h-0 overflow-y-auto px-6 py-5"><label class="grid gap-2 text-sm font-medium">发货内容<Textarea v-model="deliveryContent" rows="6" class="min-h-28 w-full" placeholder="人工发货说明、物流单号或物流信息" /></label><p class="mt-3 text-xs text-muted-foreground">标记失败不会占用成功发货快照，修正内容后可再次完成发货。</p></div>
        <DialogFooter class="flex flex-wrap border-t px-6 py-4"><Button :disabled="delivering" @click="completeDelivery">确认发货</Button><Button variant="outline" :disabled="delivering" @click="retryAutomatic">重试自动发货</Button><Button variant="destructive" :disabled="delivering" @click="markDeliveryFailed">标记发货失败</Button><Button variant="ghost" :disabled="delivering" @click="closeDelivery">取消</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="replenishDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>确认补单</DialogTitle>
          <DialogDescription>确定将订单 {{ replenishTarget?.orderNo }} 按支付成功处理吗？此操作会触发后续发货和支付成功通知，请先确认已收到款项。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="replenishingOrderId !== null" @click="replenishDialogOpen = false">取消</Button>
          <Button :disabled="replenishingOrderId !== null" @click="confirmReplenish">{{ replenishingOrderId !== null ? "补单中..." : "确认补单" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="actionDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ actionTitle }}</DialogTitle>
          <DialogDescription>{{ actionDescription }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="actionBusy" @click="actionDialogOpen = false">取消</Button>
          <Button :variant="actionMode === 'CLOSE_PENDING' ? 'default' : 'destructive'" :disabled="actionBusy || actionCount === 0" @click="confirmAction">{{ actionBusy ? "处理中..." : actionConfirmLabel }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BanIcon, RefreshCwIcon, Trash2Icon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { runTelefunc } from "@/lib/telefunc-client";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { onCloseAdminOrder, onCloseAllPendingAdminOrders, onDeleteAllClosedAdminOrders, onDeleteClosedAdminOrders, onGetAdminOrderDetail, onGetAdminOrders, onRecordManualDelivery, onReplenishAdminOrder, onRetryAutomaticDelivery } from "@/server/order/admin.telefunc";

type Order = Awaited<ReturnType<typeof onGetAdminOrders>>["orders"][number];
const timezone = useSiteTimezone();
type Detail = Awaited<ReturnType<typeof onGetAdminOrderDetail>>;
const deliveryContents = computed(() => detail.value?.deliveries.flatMap((item) => {
  if (!item.contentSnapshot) return [];
  try {
    const parsed: unknown = JSON.parse(item.contentSnapshot);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [item.contentSnapshot];
  } catch {
    return [item.contentSnapshot];
  }
}) ?? []);
const columns: AdminTableColumn<Order>[] = [
  { key: "orderNo", label: "订单" }, { key: "productName", label: "商品" }, { key: "quantity", label: "数量" }, { key: "deliveryType", label: "发货方式" }, { key: "contactValue", label: "联系方式" }, { key: "amount", label: "金额" }, { key: "delivery", label: "发货" }, { key: "status", label: "订单状态" }, { key: "createdAt", label: "创建时间" },
];
const orders = ref<Order[]>([]); const detail = ref<Detail | null>(null); const detailOpen = ref(false); const loading = ref(false); const delivering = ref(false); const replenishingOrderId = ref<number | null>(null); const replenishDialogOpen = ref(false); const replenishTarget = ref<Order | null>(null); const page = ref(1); const pageSize = ref(10); const total = ref(0); const deliveryOpen = ref(false); const deliveryOrderId = ref<number | null>(null); const deliveryContent = ref("");
const selectedIds = ref<string[]>([]); const actionDialogOpen = ref(false); const actionBusy = ref(false); const actionMode = ref<"DELETE_SELECTED" | "DELETE_FILTERED" | "CLOSE_PENDING">("DELETE_SELECTED");
const appliedFilters = ref({ query: "", status: "" as "" | Order["status"], deliveryStatus: "" as "" | Order["deliveryStatus"], startDate: "", endDate: "" });
const filters = reactive<{ query: string; status: "" | Order["status"]; deliveryStatus: "" | Order["deliveryStatus"]; startDate: string; endDate: string }>({ query: "", status: "", deliveryStatus: "", startDate: "", endDate: "" });
const dateRange = computed({ get: () => ({ start: filters.startDate, end: filters.endDate }), set: (value: { start: string; end: string }) => { filters.startDate = value.start; filters.endDate = value.end; } });
async function loadOrders() { loading.value = true; try { const result = await runTelefunc(() => onGetAdminOrders({ page: page.value, pageSize: pageSize.value, ...(filters.query ? { query: filters.query } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.deliveryStatus ? { deliveryStatus: filters.deliveryStatus } : {}), ...(filters.startDate ? { startDate: filters.startDate } : {}), ...(filters.endDate ? { endDate: filters.endDate } : {}) }), { errorMessage: "读取订单失败，请稍后重试。" }); orders.value = result.orders; total.value = result.total; page.value = result.page; selectedIds.value = []; appliedFilters.value = { query: filters.query, status: filters.status, deliveryStatus: filters.deliveryStatus, startDate: filters.startDate, endDate: filters.endDate }; } finally { loading.value = false; } }
async function showDetail(orderId: number) { detail.value = await runTelefunc(() => onGetAdminOrderDetail({ orderId }), { errorMessage: "读取订单详情失败，请稍后重试。" }); detailOpen.value = true; }
async function closeOrder(orderId: number) { try { await runTelefunc(() => onCloseAdminOrder({ orderId }), { successMessage: "订单已关闭，已释放预占资源。" }); await loadOrders(); if (detail.value?.order.id === orderId) await showDetail(orderId); } catch { /* runTelefunc already displayed the error toast. */ } }
function openReplenish(order: Order) { if (replenishingOrderId.value !== null) return; replenishTarget.value = order; replenishDialogOpen.value = true; }
async function confirmReplenish() { const target = replenishTarget.value; if (!target || replenishingOrderId.value !== null) return; replenishingOrderId.value = target.id; try { await runTelefunc(() => onReplenishAdminOrder({ orderId: target.id }), { successMessage: "补单成功，订单已按支付成功处理。" }); replenishDialogOpen.value = false; await loadOrders(); if (detail.value?.order.id === target.id) await showDetail(target.id); } catch { /* runTelefunc already displayed the error toast. */ } finally { replenishingOrderId.value = null; replenishTarget.value = null; } }
function openDelivery(orderId: number) { deliveryOrderId.value = orderId; deliveryContent.value = ""; deliveryOpen.value = true; }
function closeDelivery() { deliveryOpen.value = false; deliveryOrderId.value = null; deliveryContent.value = ""; }
function onDeliveryOpenChange(open: boolean) { if (!open && !delivering.value) closeDelivery(); }
async function completeDelivery() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value }), { successMessage: "订单已完成发货。" }); closeDelivery(); await loadOrders(); } catch { /* runTelefunc already displayed the error toast. */ } finally { delivering.value = false; } }
async function markDeliveryFailed() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value, failed: true }), { successMessage: "已标记发货失败。" }); closeDelivery(); await loadOrders(); } catch { /* runTelefunc already displayed the error toast. */ } finally { delivering.value = false; } }
async function retryAutomatic() { if (!deliveryOrderId.value) return; await retrySupplierOrAutomatic(deliveryOrderId.value, "自动发货已完成。", "自动发货尚未完成，请检查订单和卡密库存。"); }
async function retrySupplierOrder(orderId: number) { await retrySupplierOrAutomatic(orderId, "供应商订单已提交处理。", "供应商订单尚未完成发货，请查看供应商订单详情。"); }
async function retrySupplierOrAutomatic(orderId: number, successMessage: string, errorMessage: string) { delivering.value = true; try { await runTelefunc(() => onRetryAutomaticDelivery({ orderId }), { successMessage, errorMessage }); closeDelivery(); await loadOrders(); } catch { /* runTelefunc already displayed the error toast. */ } finally { delivering.value = false; } }
function resetAndLoad() { page.value = 1; void loadOrders(); }
function selectableOrder(row: Order) { return row.status === "CLOSED"; }
const actionCount = computed(() => actionMode.value === "DELETE_SELECTED" ? selectedIds.value.length : total.value);
const actionTitle = computed(() => actionMode.value === "DELETE_SELECTED" ? `删除已选的 ${actionCount.value} 个订单？` : actionMode.value === "DELETE_FILTERED" ? `删除筛选出的 ${actionCount.value} 个已关闭订单？` : `关闭筛选出的 ${actionCount.value} 个待支付订单？`);
const actionDescription = computed(() => actionMode.value === "CLOSE_PENDING" ? "只会关闭“待支付”订单并释放库存与优惠码占用，已支付订单不受影响；关闭后可在“已关闭”筛选中批量删除。" : "只会永久删除“已关闭且未支付”的订单，其他状态会自动跳过；删除后不可恢复。");
const actionConfirmLabel = computed(() => actionMode.value === "CLOSE_PENDING" ? "确认关闭" : "确认删除");
function openActionDialog(mode: "DELETE_SELECTED" | "DELETE_FILTERED" | "CLOSE_PENDING") { actionMode.value = mode; actionDialogOpen.value = true; }
function requestBulkDelete() {
  if (!selectedIds.value.length) {
    toast.info("只能删除“已关闭”的订单。请先勾选已关闭订单，或筛选“已关闭”后使用“删除全部已关闭”。");
    return;
  }
  openActionDialog("DELETE_SELECTED");
}
function appliedFilterInput() {
  const applied = appliedFilters.value;
  return {
    ...(applied.query ? { query: applied.query } : {}),
    ...(applied.deliveryStatus ? { deliveryStatus: applied.deliveryStatus } : {}),
    ...(applied.startDate ? { startDate: applied.startDate } : {}),
    ...(applied.endDate ? { endDate: applied.endDate } : {}),
  };
}
async function deleteSelectedOrders() {
  const orderIds = selectedIds.value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!orderIds.length) return;
  actionBusy.value = true;
  try {
    const result = await runTelefunc(() => onDeleteClosedAdminOrders({ orderIds }), { errorMessage: "删除订单失败，请稍后重试。" });
    actionDialogOpen.value = false;
    if (result.deleted > 0) toast.success(result.skipped > 0 ? `已删除 ${result.deleted} 个已关闭订单，跳过 ${result.skipped} 个不符合条件的订单。` : `已删除 ${result.deleted} 个已关闭订单。`);
    else toast.error("没有可删除的已关闭订单。");
    await loadOrders();
  } catch { /* runTelefunc already displayed the error toast. */ } finally { actionBusy.value = false; }
}
async function deleteFilteredOrders() {
  actionBusy.value = true;
  try {
    const result = await runTelefunc(() => onDeleteAllClosedAdminOrders(appliedFilterInput()), { errorMessage: "删除订单失败，请稍后重试。" });
    actionDialogOpen.value = false;
    if (result.deleted > 0) toast.success(`已删除 ${result.deleted} 个已关闭订单。`);
    else toast.error("没有可删除的已关闭订单。");
    await loadOrders();
  } catch { /* runTelefunc already displayed the error toast. */ } finally { actionBusy.value = false; }
}
async function closePendingOrders() {
  actionBusy.value = true;
  try {
    const result = await runTelefunc(() => onCloseAllPendingAdminOrders(appliedFilterInput()), { errorMessage: "关闭订单失败，请稍后重试。" });
    actionDialogOpen.value = false;
    if (result.closed > 0) toast.success(result.scanned >= 50 ? `已关闭 ${result.closed} 个待支付订单；仍有剩余，可再次点击继续。` : `已关闭 ${result.closed} 个待支付订单。`);
    else toast.error("没有可关闭的待支付订单。");
    await loadOrders();
  } catch { /* runTelefunc already displayed the error toast. */ } finally { actionBusy.value = false; }
}
async function confirmAction() { if (actionMode.value === "DELETE_SELECTED") await deleteSelectedOrders(); else if (actionMode.value === "DELETE_FILTERED") await deleteFilteredOrders(); else await closePendingOrders(); }
function resetFilters() { Object.assign(filters, { query: "", status: "", deliveryStatus: "", startDate: "", endDate: "" }); resetAndLoad(); }
function changePage(value: number) { page.value = value; void loadOrders(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadOrders(); }

function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value); }
function paymentLabel(value: Order["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[value]; }
function statusLabel(value: Order["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已完成", CLOSED: "已关闭", FAILED: "发货失败" }[value]; }
function statusVariant(value: Order["status"]): "default" | "secondary" | "destructive" | "outline" { return value === "FAILED" ? "destructive" : value === "CLOSED" ? "outline" : value === "PENDING" ? "secondary" : "default"; }
function deliveryLabel(value: Order["deliveryStatus"]) { return { NOT_DELIVERED: "未发货", DELIVERING: "发货中", DELIVERED: "已发货", FAILED: "发货失败" }[value]; }
function deliveryTypeLabel(value: unknown) {
  return { CARD_AUTO: "自动卡密", FIXED_CARD: "固定内容", MANUAL: "人工发货", EXPRESS: "快递发货", SUPPLIER: "供应商履约" }[value as Order["deliveryType"]] ?? "-";
}
onMounted(loadOrders);
</script>
