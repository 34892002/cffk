<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <p class="text-sm text-muted-foreground">{{ messages.auth.continue.redirecting }}</p>
  </main>
</template>

<script lang="ts" setup>
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const { messages } = useStorefrontPreferences();
</script>
