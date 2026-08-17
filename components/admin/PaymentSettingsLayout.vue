<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { adminPages, getAdminPageMeta } from "@/lib/admin-navigation";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const currentPath = computed(() => pageContext.urlPathname.replace(/\/$/, ""));
const page = computed(() => getAdminPageMeta(pageContext.urlPathname, basePath.value));
const items = [adminPages.payments, adminPages.paymentLogs] as const;

function isActive(path: string) {
  return currentPath.value === `${basePath.value}${path}`;
}
</script>

<template>
  <section class="flex w-full flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-normal">{{ page?.pageTitle ?? page?.title }}</h1>
      <p v-if="page?.description" class="mt-1 text-sm text-muted-foreground">{{ page.description }}</p>
    </div>
    <div class="grid gap-8 border-t pt-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <nav class="flex gap-1 overflow-x-auto lg:flex-col" aria-label="支付配置">
        <a v-for="item in items" :key="item.path" :href="basePath + item.path" class="shrink-0 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted" :class="isActive(item.path) ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'" :aria-current="isActive(item.path) ? 'page' : undefined">{{ item.title }}</a>
      </nav>
      <div class="min-w-0"><slot /></div>
    </div>
  </section>
</template>
