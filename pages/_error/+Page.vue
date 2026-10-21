<template>
  <Alert variant="destructive" class="max-w-2xl">
    <AlertTitle>{{ heading }}</AlertTitle>
    <AlertDescription>{{ description }}</AlertDescription>
  </Alert>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

type ErrorPageContext = ReturnType<typeof usePageContext> & { is404?: boolean; abortReason?: unknown };

const pageContext = usePageContext() as ErrorPageContext;
const { messages } = useStorefrontPreferences();
const is404 = computed(() => Boolean(pageContext.is404));
const heading = computed(() => (is404.value ? messages.value.errorPage.notFoundTitle : messages.value.errorPage.errorTitle));
const description = computed(() => {
  if (is404.value) return messages.value.errorPage.notFoundDescription;
  const reason = pageContext.abortReason;
  return typeof reason === "string" && reason.trim() ? reason : messages.value.errorPage.errorDescription;
});
</script>
