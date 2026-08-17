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
      <CardHeader class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1.5">
          <CardTitle>订单趋势</CardTitle>
          <CardDescription>按店铺时区统计新建与已支付订单。</CardDescription>
        </div>
        <ButtonGroup aria-label="选择统计周期">
          <Button
            v-for="option in rangeOptions"
            :key="option.days"
            size="sm"
            :variant="selectedRange === option.days ? 'secondary' : 'outline'"
            :aria-pressed="selectedRange === option.days"
            @click="selectedRange = option.days"
          >
            {{ option.label }}
          </Button>
        </ButtonGroup>
      </CardHeader>
      <CardContent>
        <ChartContainer :config="chartConfig" class="h-80 min-h-65 w-full sm:h-95">
          <VisXYContainer :data="visibleTrend" :margin="{ left: 8, right: 8, top: 12, bottom: 8 }">
            <VisArea
              :x="xAccessor"
              :y="createdOrdersAccessor"
              :color="chartConfig.createdOrders.color"
              :opacity="0.18"
              :line="true"
              :line-color="chartConfig.createdOrders.color"
              :line-width="2"
              curve-type="monotoneX"
            />
            <VisArea
              :x="xAccessor"
              :y="paidOrdersAccessor"
              :color="chartConfig.paidOrders.color"
              :opacity="0.15"
              :line="true"
              :line-color="chartConfig.paidOrders.color"
              :line-width="2"
              curve-type="monotoneX"
            />
            <VisAxis
              type="x"
              :x="xAccessor"
              :tick-format="formatAxisDate"
              :num-ticks="axisTickCount"
              :tick-line="false"
              :domain-line="false"
              :tick-text-hide-overlapping="true"
            />
            <VisAxis
              type="y"
              :y="createdOrdersAccessor"
              :tick-format="formatOrderCount"
              :num-ticks="5"
              :tick-line="false"
              :domain-line="false"
            />
            <ChartTooltip />
            <ChartCrosshair
              :x="xAccessor"
              :y="[createdOrdersAccessor, paidOrdersAccessor]"
              :color="crosshairColors"
              :template="tooltipTemplate"
            />
          </VisXYContainer>
        </ChartContainer>
        <div class="mt-3 flex items-center justify-center gap-5 text-sm text-muted-foreground">
          <div v-for="(item, key) in chartConfig" :key="key" class="flex items-center gap-2">
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: item.color }" />
            {{ item.label }}
          </div>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useData } from "vike-vue/useData";
import { VisArea, VisAxis, VisXYContainer } from "@unovis/vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDashboardTrendDate, type DashboardOrderTrendPoint, type DashboardTrendRange } from "@/lib/dashboard-trend";
import { useSiteTimezone } from "@/lib/site-timezone";
import type { Data } from "./+data.server";

const data = useData<Data>();
const timezone = useSiteTimezone();
const selectedRange = ref<DashboardTrendRange>(30);
const rangeOptions: Array<{ days: DashboardTrendRange; label: string }> = [
  { days: 90, label: "最近 3 个月" },
  { days: 30, label: "最近 30 天" },
  { days: 7, label: "最近 7 天" },
];
const chartConfig = {
  createdOrders: { label: "新建订单", color: "#2563eb" },
  paidOrders: { label: "已支付订单", color: "#f97316" },
} satisfies ChartConfig;
const xAccessor = (point: DashboardOrderTrendPoint) => point.timestamp;
const createdOrdersAccessor = (point: DashboardOrderTrendPoint) => point.createdOrders;
const paidOrdersAccessor = (point: DashboardOrderTrendPoint) => point.paidOrders;
const crosshairColors = (_point: DashboardOrderTrendPoint, index: number) => index === 0
  ? chartConfig.createdOrders.color
  : chartConfig.paidOrders.color;
const tooltipTemplate = componentToString(chartConfig, ChartTooltipContent, {
  hiddenKeys: ["date", "timestamp"],
  labelFormatter: (value: number | Date) => formatDashboardTrendDate(Number(value), timezone.value, true),
});

const metrics = computed(() => [
  { label: "订单总数", value: data.metrics.totalOrders, description: "全部订单" },
  { label: "已支付订单", value: data.metrics.paidOrders, description: "支付状态为已支付" },
  { label: "已支付金额", value: `¥${data.metrics.paidAmount}`, description: "累计实收金额" },
  { label: "上架商品", value: data.metrics.activeProducts, description: "当前可公开展示" },
  { label: "可用卡密", value: data.metrics.availableCards, description: "未使用自动发货库存" },
]);
const visibleTrend = computed(() => data.orderTrend.slice(-selectedRange.value));
const axisTickCount = computed(() => selectedRange.value === 7 ? 7 : selectedRange.value === 30 ? 6 : 7);

function formatAxisDate(value: number | Date) {
  return formatDashboardTrendDate(Number(value), timezone.value);
}

function formatOrderCount(value: number | Date) {
  const count = Number(value);
  return Number.isInteger(count) ? String(count) : "";
}
</script>
