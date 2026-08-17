<template>
  <slot />
  <Toaster rich-colors position="top-right" :offset="16" />
</template>

<script setup lang="ts">
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
import "./tailwind.css";
</script>
