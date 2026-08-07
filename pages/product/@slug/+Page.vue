<template>
  <main class="min-h-screen bg-muted/30">
    <header class="border-b bg-background">
      <div class="mx-auto flex min-h-16 max-w-5xl items-center px-5">
        <a href="/" class="inline-flex items-center gap-2 text-sm font-medium hover:text-muted-foreground">
          <ArrowLeftIcon class="size-4" /> 返回商品列表
        </a>
      </div>
    </header>

    <section class="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <article class="min-w-0">
        <div v-if="data.coverImage" class="aspect-16/8 overflow-hidden rounded-md border bg-muted">
          <img :src="data.coverImage" :alt="data.name" class="size-full object-cover" />
        </div>
        <Badge v-if="data.categoryName" variant="secondary" class="mt-6">{{ data.categoryName }}</Badge>
        <h1 class="mt-4 text-3xl font-semibold tracking-normal">{{ data.name }}</h1>
        <p v-if="data.subtitle" class="mt-3 text-base leading-7 text-muted-foreground">{{ data.subtitle }}</p>
        <div v-if="data.description" class="mt-8 whitespace-pre-wrap text-sm leading-7 text-foreground">{{ data.description }}</div>
      </article>

      <aside class="h-fit rounded-md border bg-card p-5">
        <p class="text-2xl font-semibold tabular-nums">{{ formatAmount(data.price) }}</p>
        <div class="mt-5 grid gap-3 border-y py-4 text-sm">
          <div class="flex items-center justify-between gap-4"><span class="text-muted-foreground">交付方式</span><span>{{ deliveryLabel(data.deliveryType) }}</span></div>
          <div class="flex items-center justify-between gap-4"><span class="text-muted-foreground">购买数量</span><span>{{ data.minBuy }} - {{ data.maxBuy }}</span></div>
          <div v-if="data.isVisibleStock" class="flex items-center justify-between gap-4"><span class="text-muted-foreground">库存</span><span :class="stockClass">{{ stockLabel }}</span></div>
        </div>
        <p v-if="data.manualDeliveryHint" class="mt-4 text-sm leading-6 text-muted-foreground">{{ data.manualDeliveryHint }}</p>
        <Button class="mt-5 w-full" as-child><a :href="`/checkout?product=${encodeURIComponent(data.slug)}`">前往结算</a></Button>
        <p v-if="data.purchaseNote" class="mt-4 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{{ data.purchaseNote }}</p>
      </aside>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { ArrowLeftIcon } from "@lucide/vue";
import { useData } from "vike-vue/useData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Data } from "./+data.server";

const data = useData<Data>();
const stockLabel = computed(() => {
  if (data.deliveryType === "CARD_AUTO") return (data.availableStock ?? 0) > 0 ? `库存 ${data.availableStock}` : "暂时缺货";
  if (data.stockMode === "UNLIMITED") return "库存充足";
  if (data.availableStock === null) return "库存有限";
  return data.availableStock > 0 ? `库存 ${data.availableStock}` : "暂时缺货";
});
const stockClass = computed(() => data.availableStock === 0 ? "text-destructive" : "");

function formatAmount(amount: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100);
}

function deliveryLabel(deliveryType: Data["deliveryType"]) {
  return { CARD_AUTO: "自动发货", FIXED_CARD: "固定内容发货", MANUAL: "人工发货", EXPRESS: "物流发货" }[deliveryType];
}
</script>
