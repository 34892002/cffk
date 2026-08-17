<script setup lang="ts">
import { computed } from "vue";
import { getAdminPageMeta } from "@/lib/admin-navigation";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const page = computed(() => getAdminPageMeta(pageContext.urlPathname, basePath.value));
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold tracking-normal">{{ page?.pageTitle ?? page?.title }}</h1>
      <p v-if="page?.description" class="mt-1 text-sm text-muted-foreground">{{ page.description }}</p>
    </div>
    <slot name="actions" />
  </div>
</template>
