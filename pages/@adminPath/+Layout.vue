<template>
  <slot v-if="isLoginPage" />
  <SidebarProvider v-else class="min-h-svh bg-muted/40">
    <AdminSidebar />
    <SidebarInset>
      <header class="sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:top-2 md:rounded-t-xl">
        <SidebarTrigger class="-ml-1 cursor-pointer" />
        <Separator orientation="vertical" class="h-4" />
        <nav class="flex items-center gap-2 text-sm" aria-label="当前位置">
          <template v-for="(title, index) in routeMeta.titles" :key="`${index}-${title}`">
            <span v-if="index > 0" class="text-muted-foreground">/</span>
            <span :class="index === routeMeta.titles.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'">{{ title }}</span>
          </template>
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
import { getAdminBreadcrumb } from "@/lib/admin-navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const isLoginPage = computed(() => pageContext.urlPathname.replace(/\/$/, "") === basePath.value);
const routeMeta = computed(() => getAdminBreadcrumb(pageContext.urlPathname, basePath.value));

</script>
