<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import ProductEditorPage from "../ProductEditorPage.vue";

const pageContext = usePageContext();
const productId = computed(() => Number(pageContext.routeParams.id));
</script>

<template><ProductEditorPage :product-id="productId" /></template>
