<template>
  <canvas ref="canvas" class="mx-auto rounded-md bg-white p-2" aria-label="支付宝付款二维码" role="img" />
</template>

<script lang="ts" setup>
import QRCode from "qrcode";
import { onMounted, ref, watch } from "vue";

const props = defineProps<{ value: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);

async function renderCode() {
  if (!canvas.value || !props.value) return;
  await QRCode.toCanvas(canvas.value, props.value, { errorCorrectionLevel: "M", margin: 1, width: 224, color: { dark: "#111827", light: "#ffffff" } });
}

onMounted(() => { void renderCode(); });
watch(() => props.value, () => { void renderCode(); });
</script>
