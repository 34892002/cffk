<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <AdminDataTable :columns="columns" :rows="orders" row-key="id" empty-text="没有符合条件的订单。">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="filters.query" class="h-8 w-56" placeholder="按订单号搜索" @keyup.enter="resetAndLoad" />
          <Select :model-value="filters.status || 'ALL'" @update:model-value="filters.status = $event === 'ALL' ? '' : $event as Order['status']"><SelectTrigger size="sm" class="w-36 shrink-0"><SelectValue placeholder="全部订单状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部订单状态</SelectItem><SelectItem value="PENDING">待支付</SelectItem><SelectItem value="PAID">已支付</SelectItem><SelectItem value="DELIVERED">已发货</SelectItem><SelectItem value="CLOSED">已关闭</SelectItem><SelectItem value="FAILED">失败</SelectItem></SelectContent></Select>
          <Select :model-value="filters.deliveryStatus || 'ALL'" @update:model-value="filters.deliveryStatus = $event === 'ALL' ? '' : $event as Order['deliveryStatus']"><SelectTrigger size="sm" class="w-36 shrink-0"><SelectValue placeholder="全部发货状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部发货状态</SelectItem><SelectItem value="NOT_DELIVERED">未发货</SelectItem><SelectItem value="DELIVERING">发货中</SelectItem><SelectItem value="DELIVERED">已发货</SelectItem><SelectItem value="FAILED">发货失败</SelectItem></SelectContent></Select>
          <div class="w-64 shrink-0"><DateRangePicker v-model="dateRange" /></div>
          <Button size="sm" @click="resetAndLoad">查询</Button>
          <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
        </div>
        <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadOrders"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
      </template>
      <template #cell-orderNo="{ row }"><span class="font-mono text-xs">{{ row.orderNo }}</span></template>
      <template #cell-productName="{ value }"><span class="font-medium">{{ value }}</span></template>
      <template #cell-quantity="{ value }"><span>{{ value }}</span></template>
      <template #cell-deliveryType="{ value }"><span class="text-sm">{{ deliveryTypeLabel(value) }}</span></template>
      <template #cell-contactValue="{ value }"><span class="text-sm text-muted-foreground">{{ value || "-" }}</span></template>
      <template #cell-amount="{ row }">¥{{ row.amount }}</template>
      <template #cell-payment="{ row }"><Badge :variant="row.paymentStatus === 'PAID' ? 'default' : 'secondary'">{{ paymentLabel(row.paymentStatus) }}</Badge></template>
      <template #cell-delivery="{ row }"><Badge :variant="row.deliveryStatus === 'FAILED' ? 'destructive' : row.deliveryStatus === 'DELIVERED' ? 'default' : 'secondary'">{{ deliveryLabel(row.deliveryStatus) }}</Badge></template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="showDetail(row.id)">查看</Button><Button v-if="row.status === 'PENDING'" variant="ghost" size="sm" @click="closeOrder(row.id)">关闭</Button><Button v-if="row.paymentStatus === 'PAID' && row.deliveryStatus !== 'DELIVERED'" variant="ghost" size="sm" @click="openDelivery(row.id)">处理发货</Button></template>
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
                      <dd class="mt-1 text-base font-semibold">¥{{ detail.order.amount }}</dd>
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
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  { key: "orderNo", label: "订单" }, { key: "productName", label: "商品" }, { key: "quantity", label: "数量" }, { key: "deliveryType", label: "发货方式" }, { key: "contactValue", label: "联系方式" }, { key: "amount", label: "金额" }, { key: "payment", label: "支付" }, { key: "delivery", label: "发货" }, { key: "createdAt", label: "创建时间" },
];
const orders = ref<Order[]>([]); const detail = ref<Detail | null>(null); const detailOpen = ref(false); const loading = ref(false); const delivering = ref(false); const error = ref<string | null>(null); const page = ref(1); const pageSize = ref(10); const total = ref(0); const deliveryOpen = ref(false); const deliveryOrderId = ref<number | null>(null); const deliveryContent = ref("");
const filters = reactive<{ query: string; status: "" | Order["status"]; deliveryStatus: "" | Order["deliveryStatus"]; startDate: string; endDate: string }>({ query: "", status: "", deliveryStatus: "", startDate: "", endDate: "" });
const dateRange = computed({ get: () => ({ start: filters.startDate, end: filters.endDate }), set: (value: { start: string; end: string }) => { filters.startDate = value.start; filters.endDate = value.end; } });
async function loadOrders() { loading.value = true; error.value = null; try { const result = await runTelefunc(() => onGetAdminOrders({ page: page.value, pageSize: pageSize.value, ...(filters.query ? { query: filters.query } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.deliveryStatus ? { deliveryStatus: filters.deliveryStatus } : {}), ...(filters.startDate ? { startDate: filters.startDate } : {}), ...(filters.endDate ? { endDate: filters.endDate } : {}) }), { notifyError: false }); orders.value = result.orders; total.value = result.total; page.value = result.page; } catch (cause) { error.value = userErrorMessage(cause, "读取订单失败，请稍后重试。"); } finally { loading.value = false; } }
async function showDetail(orderId: number) { try { detail.value = await runTelefunc(() => onGetAdminOrderDetail({ orderId }), { notifyError: false }); detailOpen.value = true; } catch (cause) { error.value = userErrorMessage(cause); } }
async function closeOrder(orderId: number) { try { await runTelefunc(() => onCloseAdminOrder({ orderId }), { successMessage: "订单已关闭，已释放预占资源。" }); await loadOrders(); if (detail.value?.order.id === orderId) await showDetail(orderId); } catch (cause) { error.value = userErrorMessage(cause, "该订单当前不能关闭。"); } }
function openDelivery(orderId: number) { deliveryOrderId.value = orderId; deliveryContent.value = ""; deliveryOpen.value = true; }
function closeDelivery() { deliveryOpen.value = false; deliveryOrderId.value = null; deliveryContent.value = ""; }
function onDeliveryOpenChange(open: boolean) { if (!open && !delivering.value) closeDelivery(); }
async function completeDelivery() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value }), { successMessage: "订单已完成发货。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "无法完成发货，请检查订单状态和内容。"); } finally { delivering.value = false; } }
async function markDeliveryFailed() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRecordManualDelivery({ orderId: deliveryOrderId.value!, content: deliveryContent.value, failed: true }), { successMessage: "已标记发货失败。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "无法更新发货状态。"); } finally { delivering.value = false; } }
async function retryAutomatic() { if (!deliveryOrderId.value) return; delivering.value = true; try { await runTelefunc(() => onRetryAutomaticDelivery({ orderId: deliveryOrderId.value! }), { successMessage: "自动发货已完成。" }); closeDelivery(); await loadOrders(); } catch (cause) { error.value = userErrorMessage(cause, "自动发货尚未完成，请检查订单和卡密库存。"); } finally { delivering.value = false; } }
function resetAndLoad() { page.value = 1; void loadOrders(); }
function resetFilters() { Object.assign(filters, { query: "", status: "", deliveryStatus: "", startDate: "", endDate: "" }); resetAndLoad(); }
function changePage(value: number) { page.value = value; void loadOrders(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadOrders(); }

function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value); }
function paymentLabel(value: Order["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[value]; }
function deliveryLabel(value: Order["deliveryStatus"]) { return { NOT_DELIVERED: "未发货", DELIVERING: "发货中", DELIVERED: "已发货", FAILED: "发货失败" }[value]; }
function deliveryTypeLabel(value: unknown) {
  return { CARD_AUTO: "自动卡密", FIXED_CARD: "固定内容", MANUAL: "人工发货", EXPRESS: "快递发货" }[value as Order["deliveryType"]] ?? "-";
}
onMounted(loadOrders);
</script>
