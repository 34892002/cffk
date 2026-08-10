<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur"><div class="mx-auto flex min-h-16 max-w-2xl items-center justify-between px-5"><a href="/" class="text-sm font-medium hover:text-muted-foreground">返回商品列表</a><a href="/" class="text-sm font-medium hover:text-muted-foreground">首页</a></div></header>
    <section class="mx-auto max-w-2xl px-5 pb-10 pt-26">
      <Card>
        <CardHeader>
          <CardTitle>{{ order ? '支付结果' : '无法确认支付结果' }}</CardTitle>
          <CardDescription>{{ order ? order.productName : '支付平台返回仅用于跳转；订单状态以本站查询和支付回调为准。' }}</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4 text-sm">
          <Alert v-if="!order" variant="destructive"><AlertTitle>请查询订单</AlertTitle><AlertDescription>{{ missingMessage }}</AlertDescription></Alert>
          <template v-else>
            <div class="flex items-center justify-between gap-4 rounded-md border p-4"><span>订单状态</span><Badge :variant="statusVariant(order.status)">{{ statusLabel(order.status) }}</Badge></div>
            <div class="grid gap-3 border-y py-4"><div class="flex justify-between gap-4"><span class="text-muted-foreground">订单号</span><span class="font-mono text-xs">{{ order.orderNo }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">金额</span><span>¥{{ order.amount }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">支付状态</span><span>{{ paymentStatusLabel(order.paymentStatus) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">交付状态</span><span>{{ deliveryStatusLabel(order.deliveryStatus) }}</span></div></div>
            <div v-if="order.deliveries.length"><p class="font-medium">交付内容</p><pre class="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-6">{{ order.deliveries.join('\n') }}</pre></div>
            <p v-else class="text-muted-foreground">支付通知可能仍在处理中，页面会自动查询订单状态。</p>
          </template>
        </CardContent>
        <CardFooter class="flex justify-between gap-3"><a href="/order" class="text-sm font-medium hover:text-muted-foreground">打开订单查询</a><Button v-if="order?.paymentStatus === 'UNPAID'" variant="outline" size="sm" :disabled="refreshing" @click="refreshOrder">{{ refreshing ? "查询中..." : "刷新状态" }}</Button></CardFooter>
      </Card>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useData } from "vike-vue/useData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { runTelefunc } from "@/lib/telefunc-client";
import { onQueryOrder } from "@/server/order/public.telefunc";
import type { Data } from "./+data.server";

type QueriedOrder = NonNullable<Data["order"]>;
const data = useData<Data>();
const order = ref(data.order);
const refreshing = ref(false);
const missingMessage = data.orderNoProvided && data.tokenProvided ? "订单不存在，或查询令牌不正确。" : "支付回跳缺少订单号或查询令牌。";
let timer: ReturnType<typeof setInterval> | undefined;
async function refreshOrder() {
  if (!data.orderNoProvided || !data.tokenProvided || refreshing.value) return;
  refreshing.value = true;
  try {
    const result = await runTelefunc(() => onQueryOrder({ orderNo: new URLSearchParams(window.location.search).get("orderNo") ?? "", queryToken: new URLSearchParams(window.location.search).get("queryToken") ?? "" }), { notifyError: false });
    if (result) order.value = result;
    if (result?.paymentStatus === "PAID" && timer) { clearInterval(timer); timer = undefined; }
  } finally { refreshing.value = false; }
}
onMounted(() => { if (order.value?.paymentStatus === "UNPAID") timer = setInterval(() => { void refreshOrder(); }, 5000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

function statusLabel(status: QueriedOrder["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已交付", CLOSED: "已关闭", FAILED: "失败" }[status]; }
function paymentStatusLabel(status: QueriedOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function deliveryStatusLabel(status: QueriedOrder["deliveryStatus"]) { return { NOT_DELIVERED: "未交付", DELIVERED: "已交付", FAILED: "交付失败" }[status]; }
function statusVariant(status: QueriedOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
