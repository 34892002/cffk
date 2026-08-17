<template>
  <a href="/" class="flex min-w-0 items-center gap-2 font-semibold" aria-label="返回首页">
    <img :src="brandLogoUrl" :alt="`${siteName} Logo`" class="size-9 shrink-0 rounded-md object-contain" />
    <span class="truncate">{{ siteName }}</span>
  </a>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

import logoUrl from "@/assets/logo.svg?url";

type Site = { name?: string | null; logo?: string | null };
type PageContext = ReturnType<typeof usePageContext> & { site?: Site | null };

const pageContext = usePageContext() as PageContext;
const siteName = computed(() => pageContext.site?.name?.trim() || "CFFK-Shop");
const brandLogoUrl = computed(() => pageContext.site?.logo || logoUrl);
</script>
