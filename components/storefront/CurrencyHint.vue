<template>
  <span v-if="hint" class="ml-1 align-baseline text-xs font-normal text-muted-foreground">{{ hint }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

import { BASE_CURRENCY, isCurrencyCode } from "@/lib/money";

const props = defineProps<{ currency?: string }>();
const pageContext = usePageContext() as { site?: { currency?: string } };

const hint = computed(() => {
  const currency = isCurrencyCode(props.currency)
    ? props.currency
    : isCurrencyCode(pageContext.site?.currency)
      ? pageContext.site.currency
      : BASE_CURRENCY;
  return currency === BASE_CURRENCY ? null : currency;
});
</script>
