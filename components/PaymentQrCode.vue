<template>
  <canvas ref="canvas" class="mx-auto rounded-md bg-white p-2" :aria-label="messages.checkout.qrCodeLabel" role="img" />
</template>

<script lang="ts" setup>
import QRCode from "qrcode";
import { onMounted, ref, watch } from "vue";

import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const props = defineProps<{ value: string }>();
const { messages } = useStorefrontPreferences();
const canvas = ref<HTMLCanvasElement | null>(null);

async function renderCode() {
  if (!canvas.value || !props.value) return;
  await QRCode.toCanvas(canvas.value, props.value, { errorCorrectionLevel: "M", margin: 1, width: 224, color: { dark: "#111827", light: "#ffffff" } });
}

onMounted(() => { void renderCode(); });
watch(() => props.value, () => { void renderCode(); });
</script>
