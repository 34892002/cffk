<template>
  <span v-if="hint" class="ml-1 align-baseline text-xs font-normal text-muted-foreground">{{ hint }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { currencyHintFor } from "@/lib/currency";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const { locale } = useStorefrontPreferences();
const hint = computed(() => currencyHintFor(locale.value));
</script>
