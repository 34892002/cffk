<template>
  <main class="min-h-screen bg-muted/30">
    <header class="border-b bg-background">
      <div class="mx-auto flex min-h-16 max-w-2xl items-center px-5">
        <a href="/" class="text-sm font-medium hover:text-muted-foreground">返回商品列表</a>
      </div>
    </header>

    <section class="mx-auto max-w-2xl px-5 py-10">
      <Card>
        <CardHeader>
          <CardTitle>订单查询</CardTitle>
          <CardDescription>输入订单号和查询令牌查看支付与交付状态。</CardDescription>
        </CardHeader>
        <form @submit.prevent="onSubmit">
          <CardContent class="grid gap-4">
            <label class="grid gap-2 text-sm font-medium">订单号<Input v-model="orderNo" required autocomplete="off" /></label>
            <label class="grid gap-2 text-sm font-medium">查询令牌<Input v-model="queryToken" required autocomplete="off" /></label>
            <Alert v-if="error" variant="destructive"><AlertTitle>查询失败</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
          </CardContent>
          <CardFooter><Button type="submit" :disabled="loading">{{ loading ? "查询中..." : "查询订单" }}</Button></CardFooter>
        </form>
      </Card>

      <Card v-if="result" class="mt-6">
        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle>{{ result.productName }}</CardTitle><CardDescription class="mt-1 font-mono">{{ result.orderNo }}</CardDescription></div>
            <Badge :variant="statusVariant(result.status)">{{ statusLabel(result.status) }}</Badge>
          </div>
        </CardHeader>
        <CardContent class="grid gap-4 text-sm">
          <div class="grid gap-2 border-y py-4"><div class="flex justify-between gap-4"><span class="text-muted-foreground">数量</span><span>{{ result.quantity }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">金额</span><span>{{ formatAmount(result.amount) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">支付状态</span><span>{{ paymentStatusLabel(result.paymentStatus) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">交付状态</span><span>{{ deliveryStatusLabel(result.deliveryStatus) }}</span></div></div>
          <div v-if="result.deliveries.length"><p class="font-medium">交付内容</p><pre class="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-6">{{ result.deliveries.join("\n") }}</pre></div>
          <p v-else-if="result.paymentStatus === 'PAID'" class="text-muted-foreground">订单已支付，正在等待交付处理。</p>
        </CardContent>
      </Card>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { onQueryOrder, type PublicOrder } from "@/server/order/public.telefunc";

const orderNo = ref("");
const queryToken = ref("");
const result = ref<PublicOrder | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function onSubmit() {
  error.value = null;
  result.value = null;
  loading.value = true;
  try {
    const record = await onQueryOrder({ orderNo: orderNo.value, queryToken: queryToken.value });
    if (!record) error.value = "订单不存在，或查询令牌不正确。";
    else result.value = record;
  } catch {
    error.value = "请求未能完成，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

function formatAmount(amount: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100); }
function statusLabel(status: PublicOrder["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已交付", CLOSED: "已关闭", FAILED: "失败" }[status]; }
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function deliveryStatusLabel(status: PublicOrder["deliveryStatus"]) { return { NOT_DELIVERED: "未交付", DELIVERED: "已交付", FAILED: "交付失败" }[status]; }
function statusVariant(status: PublicOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
