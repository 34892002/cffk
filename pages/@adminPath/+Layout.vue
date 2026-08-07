<template>
  <slot v-if="isLoginPage" />
  <SidebarProvider v-else class="min-h-svh bg-muted/40">
    <AdminSidebar />
    <SidebarInset>
      <header class="sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:top-2 md:rounded-t-xl">
        <SidebarTrigger class="-ml-1 cursor-pointer" />
        <Separator orientation="vertical" class="h-4" />
        <nav class="flex items-center gap-2 text-sm" aria-label="当前位置">
          <span v-if="parentTitle" class="text-muted-foreground">{{ parentTitle }}</span>
          <span v-if="parentTitle" class="text-muted-foreground">/</span>
          <span class="font-medium text-foreground">{{ pageTitle }}</span>
        </nav>
      </header>
      <main class="@container/main flex flex-1 flex-col p-4 lg:p-6">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

<script lang="ts" setup>
import AdminSidebar from "@/components/AdminSidebar.vue";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const isLoginPage = computed(() => pageContext.urlPathname.replace(/\/$/, "") === basePath.value);
const routeMeta = computed(() => {
  const pathname = pageContext.urlPathname;
  const mailPath = `${basePath.value}/mail`;
  const productPaths = ["categories", "products", "cards", "discounts"];
  const systemPaths = ["payments", "media", "settings", "security"];
  const segment = pathname.split("/").at(-1);
  const titles: Record<string, string> = {
    dash: "仪表盘",
    catalog: "商品目录",
    categories: "分类管理",
    products: "商品列表",
    cards: "卡密管理",
    orders: "订单管理",
    discounts: "折扣码管理",
    payments: "支付渠道",
    admins: "管理员账户",
    media: "媒体存储",
    tasks: "任务",
    overview: "邮件统计",
    "post-office": "通道配置",
    templates: "邮件模板",
    history: "发送历史",
  };

  const parent = pathname.startsWith(mailPath)
    ? "邮件配置"
    : productPaths.some((item) => pathname === `${basePath.value}/${item}`)
      ? "商品管理"
      : systemPaths.some((item) => pathname === `${basePath.value}/${item}`)
        ? "系统配置"
        : pathname === `${basePath.value}/admins`
          ? "用户管理"
          : undefined;

  return {
    parent,
    title: titles[segment ?? ""] ?? "管理后台",
  };
});
const parentTitle = computed(() => routeMeta.value.parent);
const pageTitle = computed(() => routeMeta.value.title);
</script>
