<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-2xl items-center justify-between px-5">
        <StorefrontBrand />
        <PublicNav />
      </div>
    </header>
    <section class="mx-auto max-w-2xl px-5 pb-10 pt-26">
      <Card>
        <CardHeader>
          <CardTitle>{{ order ? "支付结果" : "确认支付结果" }}</CardTitle>
          <CardDescription>{{ order ? order.productName : "支付平台返回仅用于跳转；订单状态以本站查询和支付回调为准。" }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4 text-sm">
          <Alert v-if="message" :variant="error ? 'destructive' : 'default'">
            <AlertTitle>{{ error ? "查询失败" : "需要订单信息" }}</AlertTitle>
            <AlertDescription>{{ message }}</AlertDescription>
          </Alert>
          <template v-if="order">
            <div class="flex items-center justify-between gap-4 rounded-md border p-4"><span>订单状态</span><Badge :variant="statusVariant(order.status)">{{ statusLabel(order.status) }}</Badge></div>
            <div class="grid gap-3 border-y py-4"><div class="flex justify-between gap-4"><span class="text-muted-foreground">订单号</span><span class="font-mono text-xs">{{ order.orderNo }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">金额</span><span>¥{{ order.amount }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">支付状态</span><span>{{ paymentStatusLabel(order.paymentStatus) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">发货状态</span><span>{{ deliveryStatusLabel(order.deliveryStatus) }}</span></div></div>
            <div v-if="order.deliveries.length"><p class="font-medium">发货内容</p><pre class="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-6">{{ order.deliveries.join("\n") }}</pre></div>
            <p v-else class="text-muted-foreground">支付通知可能仍在处理中，页面会自动查询订单状态。</p>
          </template>
        </CardContent>
        <CardFooter class="flex justify-between gap-3">
          <a :href="orderPageHref" class="text-sm font-medium hover:text-muted-foreground">打开订单查询</a>
          <Button v-if="order?.paymentStatus === 'UNPAID'" variant="outline" size="sm" :disabled="refreshing" @click="refreshOrder">{{ refreshing ? "查询中..." : "刷新状态" }}</Button>
        </CardFooter>
      </Card>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";
import PublicNav from "@/components/storefront/PublicNav.vue";
import StorefrontBrand from "@/components/storefront/StorefrontBrand.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocalOrderGroups } from "@/lib/local-orders";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onQueryOrder, type PublicOrder } from "@/server/order/public.telefunc";
import type { Data } from "./+data.server";

type PublicUser = { id: string };

const data = useData<Data>();
const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user?: PublicUser | null };
const order = ref<PublicOrder | null>(null);
const refreshing = ref(false);
const error = ref<string | null>(null);
const email = ref<string | undefined>();
const orderPageHref = computed(() => data.orderNo ? `/order?orderNo=${encodeURIComponent(data.orderNo)}` : "/order");
const message = computed(() => {
  if (error.value) return error.value;
  if (!data.orderNo) return "支付回跳缺少订单号，请前往订单查询页输入订单信息。";
  if (!pageContext.user && !email.value) return "本机未找到该匿名订单，请前往订单查询页输入下单邮箱。";
  if (!order.value && !refreshing.value) return "正在确认订单状态。";
  return null;
});
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (!data.orderNo) return;
  if (!pageContext.user) {
    const groups = getLocalOrderGroups();
    email.value = Object.entries(groups).find(([, orders]) => orders.some((item) => item.orderNo === data.orderNo))?.[0];
    if (!email.value) return;
  }
  void refreshOrder();
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

async function refreshOrder() {
  if (!data.orderNo || (!pageContext.user && !email.value) || refreshing.value) return;
  refreshing.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onQueryOrder({ orderNo: data.orderNo, ...(email.value ? { email: email.value } : {}) }), { notifyError: false });
    if (!result) {
      error.value = pageContext.user ? "未找到当前账户下的该订单。" : "订单不存在，或下单邮箱不匹配。";
      return;
    }
    order.value = result;
    if (result.paymentStatus === "UNPAID" && !timer) timer = setInterval(() => { void refreshOrder(); }, 5000);
    if (result.paymentStatus !== "UNPAID" && timer) { clearInterval(timer); timer = undefined; }
  } catch (cause) {
    error.value = userErrorMessage(cause, "暂时无法确认订单状态，请稍后重试。");
  } finally {
    refreshing.value = false;
  }
}

function statusLabel(status: PublicOrder["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已发货", CLOSED: "已关闭", FAILED: "失败" }[status]; }
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function deliveryStatusLabel(status: PublicOrder["deliveryStatus"]) { return { NOT_DELIVERED: "未发货", DELIVERING: "发货中", DELIVERED: "已发货", FAILED: "发货失败" }[status]; }
function statusVariant(status: PublicOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
