<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card v-for="metric in metrics" :key="metric.label" class="gap-0">
        <CardHeader class="pb-0">
          <CardDescription>{{ metric.label }}</CardDescription>
          <CardTitle class="text-2xl font-semibold tabular-nums">{{ metric.value }}</CardTitle>
        </CardHeader>
        <CardFooter class="pt-1.5 text-sm text-muted-foreground">{{ metric.description }}</CardFooter>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>今日新建订单</CardTitle>
        <CardDescription>按创建时间倒序显示，最多 10 条。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单号</TableHead>
                <TableHead>商品</TableHead>
                <TableHead>数量</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>订单状态</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in data.recentOrders" :key="item.id">
                <TableCell class="font-mono text-xs">{{ item.orderNo }}</TableCell>
                <TableCell class="font-medium">{{ item.productName }}</TableCell>
                <TableCell class="tabular-nums">{{ item.quantity }}</TableCell>
                <TableCell class="tabular-nums">{{ formatAmount(item.amount) }}</TableCell>
                <TableCell><Badge :variant="statusVariant(item.status)">{{ statusLabel(item.status) }}</Badge></TableCell>
                <TableCell class="whitespace-nowrap text-muted-foreground">{{ formatDate(item.createdAt) }}</TableCell>
              </TableRow>
              <TableRow v-if="!data.recentOrders.length">
                <TableCell colspan="6" class="h-28 text-center text-muted-foreground">今天还没有新建订单。</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useData } from "vike-vue/useData";
import { Badge } from "@/components/ui/badge";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Data } from "./+data.server";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";

const data = useData<Data>();
const timezone = useSiteTimezone();
const metrics = computed(() => [
  { label: "订单总数", value: data.metrics.totalOrders, description: "全部订单" },
  { label: "已支付订单", value: data.metrics.paidOrders, description: "支付状态为已支付" },
  { label: "已支付金额", value: formatAmount(data.metrics.paidAmount), description: "累计实收金额" },
  { label: "上架商品", value: data.metrics.activeProducts, description: "当前可公开展示" },
  { label: "可用卡密", value: data.metrics.availableCards, description: "未使用自动发货库存" },
]);

function formatAmount(amount: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100);
}

function formatDate(value: Date) {
  return formatDateInTimezone(value, timezone.value);
}

function statusLabel(status: Data["recentOrders"][number]["status"]) {
  return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已交付", CLOSED: "已关闭", FAILED: "失败" }[status];
}

function statusVariant(status: Data["recentOrders"][number]["status"]) {
  return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline";
}
</script>
