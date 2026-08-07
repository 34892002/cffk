<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <a href="/" class="flex min-w-0 items-center gap-2 font-semibold">
          <img :src="brandLogoUrl" :alt="`${site.name} Logo`" class="size-8 shrink-0 rounded-md object-contain" />
          <span class="truncate">{{ site.name }}</span>
        </a>
        <nav class="flex shrink-0 items-center gap-2" aria-label="主导航">
          <Button size="sm" variant="outline" as-child><a href="/order">我的订单</a></Button>
          <a v-if="site.supportContact" :href="supportHref" class="ml-2 text-sm text-muted-foreground hover:text-foreground">联系支持</a>
        </nav>
      </div>
    </header>

    <section class="border-b bg-background pt-16">
      <div class="mx-auto grid max-w-6xl gap-5 px-5 py-8 sm:grid-cols-[minmax(0,1fr)_22rem] sm:items-center">
        <div v-if="site.notice" class="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
          <InfoIcon class="mt-1 size-4 shrink-0 text-foreground" />
          <p class="m-0">{{ site.notice }}</p>
        </div>
        <p v-else class="text-sm text-muted-foreground">{{ site.subtitle || "选择商品后进入结算流程" }}</p>
        <div class="relative">
          <SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" class="pl-9" placeholder="搜索商品名称或关键词" aria-label="搜索商品" />
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-5 py-10 sm:py-12">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold tracking-normal">商品</h2>
          <p class="mt-1 text-sm text-muted-foreground">{{ query ? `找到 ${visibleProducts.length} 件相关商品` : "选择商品后进入结算流程" }}</p>
        </div>
        <div v-if="data.categories.length" class="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="商品分类">
          <Button size="sm" :variant="selectedCategory === null ? 'default' : 'outline'" @click="selectedCategory = null">全部</Button>
          <Button
            v-for="category in data.categories"
            :key="category.id"
            size="sm"
            :variant="selectedCategory === category.id ? 'default' : 'outline'"
            @click="selectedCategory = category.id"
          >
            {{ category.name }}
          </Button>
        </div>
      </div>

      <div v-if="visibleProducts.length" class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="product in visibleProducts" :key="product.id" class="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg">
          <a :href="`/product/${product.slug}`" class="block">
            <div class="relative aspect-16/10 overflow-hidden bg-muted">
              <img :src="product.coverImage || defaultProductImage" :alt="product.name" class="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <Badge variant="secondary" class="absolute left-3 top-3 bg-background/90 backdrop-blur">{{ product.categoryName || "商品" }}</Badge>
            </div>
            <div class="flex min-h-32 flex-col p-4">
              <h3 class="line-clamp-2 text-base font-semibold tracking-normal">{{ product.name }}</h3>
              <p v-if="product.subtitle" class="mt-1 line-clamp-1 text-sm text-muted-foreground">{{ product.subtitle }}</p>
              <div class="mt-auto flex items-end justify-between gap-3 pt-4">
                <span v-if="product.isVisibleStock" :class="stockClass(product)" class="text-xs">{{ stockLabel(product) }}</span>
                <span v-else class="text-xs text-muted-foreground">{{ deliveryLabel(product.deliveryType) }}</span>
                <span class="shrink-0 text-xl font-semibold tabular-nums">{{ formatAmount(product.price) }}</span>
              </div>
            </div>
          </a>
        </article>
      </div>

      <div v-else class="mt-6 border border-dashed bg-background px-6 py-16 text-center">
        <PackageOpenIcon class="mx-auto size-8 text-muted-foreground" />
        <h3 class="mt-4 text-base font-semibold">暂无可购买商品</h3>
        <p class="mt-2 text-sm text-muted-foreground">商品上架后会显示在这里。</p>
      </div>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { InfoIcon, PackageOpenIcon, SearchIcon } from "@lucide/vue";
import logoUrl from "@/assets/logo.svg?url";
import defaultProductImage from "@/assets/product_img.jpg?url";
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Data } from "./+data.server";

type Product = Data["products"][number];
type Site = {
  name: string;
  subtitle: string | null;
  logo: string | null;
  notice: string | null;
  supportContact: string | null;
};

const data = useData<Data>();
const pageContext = usePageContext() as unknown as { site: Site };
const site = pageContext.site;
const selectedCategory = ref<number | null>(null);
const query = ref("");
const brandLogoUrl = computed(() => site.logo || logoUrl);
const visibleProducts = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return data.products.filter((product) =>
    (selectedCategory.value === null || product.categoryId === selectedCategory.value)
    && (!keyword || product.name.toLowerCase().includes(keyword) || product.subtitle?.toLowerCase().includes(keyword)),
  );
});
const supportHref = computed(() => {
  const contact = site.supportContact ?? "";
  return contact.includes(":") ? contact : `mailto:${contact}`;
});

function formatAmount(amount: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100);
}

function deliveryLabel(deliveryType: Product["deliveryType"]) {
  return {
    CARD_AUTO: "自动发货",
    FIXED_CARD: "固定内容发货",
    MANUAL: "人工发货",
    EXPRESS: "物流发货",
  }[deliveryType];
}

function stockLabel(product: Product) {
  if (product.deliveryType === "CARD_AUTO") {
    const availableStock = product.availableStock ?? 0;
    return availableStock > 0 ? `库存 ${availableStock}` : "暂时缺货";
  }
  if (product.stockMode === "UNLIMITED") return "库存充足";
  if (product.availableStock === null) return "库存有限";
  return product.availableStock > 0 ? `库存 ${product.availableStock}` : "暂时缺货";
}
function stockClass(product: Product) {
  return product.deliveryType === "CARD_AUTO" || product.stockMode === "FINITE"
    ? product.availableStock === 0 ? "text-orange-500" : "text-muted-foreground"
    : "text-muted-foreground";
}
</script>
