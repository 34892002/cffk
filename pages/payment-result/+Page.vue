<template>
  <main class="min-h-screen bg-muted/30">
    <header class="border-b bg-background"><div class="mx-auto flex min-h-16 max-w-2xl items-center px-5"><a href="/" class="text-sm font-medium hover:text-muted-foreground">返回商品列表</a></div></header>
    <section class="mx-auto max-w-2xl px-5 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{{ data.order ? '支付结果' : '无法确认支付结果' }}</CardTitle>
          <CardDescription>{{ data.order ? data.order.productName : '支付宝已返回，但订单状态仍须以本站回调和订单查询为准。' }}</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4 text-sm">
          <Alert v-if="!data.order" variant="destructive"><AlertTitle>请查询订单</AlertTitle><AlertDescription>{{ missingMessage }}</AlertDescription></Alert>
          <template v-else>
            <div class="flex items-center justify-between gap-4 rounded-md border p-4"><span>订单状态</span><Badge :variant="statusVariant(data.order.status)">{{ statusLabel(data.order.status) }}</Badge></div>
            <div class="grid gap-3 border-y py-4"><div class="flex justify-between gap-4"><span class="text-muted-foreground">订单号</span><span class="font-mono text-xs">{{ data.order.orderNo }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">金额</span><span>{{ formatAmount(data.order.amount) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">支付状态</span><span>{{ paymentStatusLabel(data.order.paymentStatus) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">交付状态</span><span>{{ deliveryStatusLabel(data.order.deliveryStatus) }}</span></div></div>
            <div v-if="data.order.deliveries.length"><p class="font-medium">交付内容</p><pre class="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-6">{{ data.order.deliveries.join('\n') }}</pre></div>
            <p v-else class="text-muted-foreground">支付通知可能仍在处理中，请稍后使用订单号和查询令牌再次查询。</p>
          </template>
        </CardContent>
        <CardFooter><a href="/order" class="text-sm font-medium hover:text-muted-foreground">打开订单查询</a></CardFooter>
      </Card>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { useData } from "vike-vue/useData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Data } from "./+data.server";

type QueriedOrder = NonNullable<Data["order"]>;
const data = useData<Data>();
const missingMessage = data.orderNoProvided && data.tokenProvided ? "订单不存在，或查询令牌不正确。" : "支付回跳缺少订单号或查询令牌。";
function formatAmount(amount: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100); }
function statusLabel(status: QueriedOrder["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已交付", CLOSED: "已关闭", FAILED: "失败" }[status]; }
function paymentStatusLabel(status: QueriedOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function deliveryStatusLabel(status: QueriedOrder["deliveryStatus"]) { return { NOT_DELIVERED: "未交付", DELIVERED: "已交付", FAILED: "交付失败" }[status]; }
function statusVariant(status: QueriedOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
