<script setup lang="ts">
import { computed } from "vue";
import { adminNavigation, adminPages, getAdminPageMeta, isNavigationModule } from "@/lib/admin-navigation";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const currentPath = computed(() => pageContext.urlPathname.replace(/\/$/, ""));
const page = computed(() => getAdminPageMeta(pageContext.urlPathname, basePath.value));
const items = computed(() => {
  const pushItems = adminNavigation.push.items;
  const emailItem = pushItems.find((item) => item.path === adminPages.email.path);
  return emailItem && isNavigationModule(emailItem) ? [emailItem, ...emailItem.items] : [adminPages.email];
});

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
      <nav class="flex gap-1 overflow-x-auto lg:flex-col" aria-label="邮件配置">
        <a
          v-for="item in items"
          :key="item.path"
          :href="basePath + item.path"
          class="shrink-0 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          :class="isActive(item.path) ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
          :aria-current="isActive(item.path) ? 'page' : undefined"
        >
          {{ item.title }}
        </a>
      </nav>

      <div class="min-w-0">
        <slot />
      </div>
    </div>
  </section>
</template>
