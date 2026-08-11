<template>
  <Field v-if="showNotify">
    <FieldLabel>回调地址</FieldLabel>
    <InputGroup>
      <Popover>
        <PopoverTrigger as-child>
          <InputGroupAddon>
            <InputGroupButton aria-label="回调地址说明" title="回调地址说明" size="icon-xs" type="button"><InfoIcon /></InputGroupButton>
          </InputGroupAddon>
        </PopoverTrigger>
        <PopoverContent align="start" class="space-y-1 text-sm">
          <p class="font-medium">支付平台会将付款结果发送到此地址。</p>
          <p class="text-muted-foreground">网站域名和回调路径由系统固定生成，避免配置到不存在的接口。</p>
          <p v-if="provider === 'STRIPE'" class="text-muted-foreground">复制后粘贴到 Stripe Dashboard 的 Webhook Endpoint。</p>
          <p v-else-if="provider === 'HASHPAY'" class="text-muted-foreground">复制后粘贴到 HashPay 商户后台的回调地址。</p>
        </PopoverContent>
      </Popover>
      <InputGroupAddon class="shrink-0 text-foreground">{{ origin }}</InputGroupAddon>
      <InputGroupInput :model-value="notifyPath" disabled />
      <InputGroupAddon align="inline-end">
        <InputGroupButton :aria-label="copiedField === 'notify' ? '已复制回调地址' : '复制回调地址'" :title="copiedField === 'notify' ? '已复制' : '复制'" size="icon-xs" type="button" :disabled="!notifyUrl" @click="copyUrl('notify', notifyUrl)">
          <CheckIcon v-if="copiedField === 'notify'" /><CopyIcon v-else />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    <FieldDescription v-if="!notifyUrl">请先在系统设置中填写网站地址。</FieldDescription>
  </Field>

  <Field>
    <FieldLabel>返回地址</FieldLabel>
    <InputGroup>
      <Popover>
        <PopoverTrigger as-child>
          <InputGroupAddon>
            <InputGroupButton aria-label="返回地址说明" title="返回地址说明" size="icon-xs" type="button"><InfoIcon /></InputGroupButton>
          </InputGroupAddon>
        </PopoverTrigger>
        <PopoverContent align="start" class="space-y-1 text-sm">
          <p class="font-medium">支付完成或取消后，用户浏览器会跳转到此页面。</p>
          <p class="text-muted-foreground">网站域名取自系统设置。可按站内实际结果页调整路径。</p>
        </PopoverContent>
      </Popover>
      <InputGroupAddon class="shrink-0 text-foreground">{{ origin }}</InputGroupAddon>
      <InputGroupInput :model-value="returnPath" :disabled="!origin" @update:model-value="setUrl('return', String($event))" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton :aria-label="copiedField === 'return' ? '已复制返回地址' : '复制返回地址'" :title="copiedField === 'return' ? '已复制' : '复制'" size="icon-xs" type="button" :disabled="!returnUrl" @click="copyUrl('return', returnUrl)">
          <CheckIcon v-if="copiedField === 'return'" /><CopyIcon v-else />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    <FieldDescription v-if="!returnUrl">请先在系统设置中填写网站地址。</FieldDescription>
  </Field>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { CheckIcon, CopyIcon, InfoIcon } from "@lucide/vue";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const props = defineProps<{ notifyUrl: string; returnUrl: string; showNotify: boolean; siteUrl: string | null; provider: string }>();
const emit = defineEmits<{ "update:notifyUrl": [value: string]; "update:returnUrl": [value: string] }>();
const origin = computed(() => props.siteUrl ? new URL(props.siteUrl).origin : "");
const notifyPath = computed(() => pathOf(props.notifyUrl));
const returnPath = computed(() => pathOf(props.returnUrl));
const copiedField = ref<"notify" | "return" | null>(null);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function pathOf(value: string) {
  try { const url = new URL(value); return `${url.pathname}${url.search}${url.hash}`; } catch { return value; }
}

function setUrl(field: "notify" | "return", value: string) {
  if (!origin.value) return;
  const path = value.trim() ? (value.startsWith("/") ? value : `/${value}`) : "/";
  if (field === "notify") emit("update:notifyUrl", `${origin.value}${path}`);
  else emit("update:returnUrl", `${origin.value}${path}`);
}

async function copyUrl(field: "notify" | "return", value: string) {
  if (!value || !navigator.clipboard) return;
  await navigator.clipboard.writeText(value);
  copiedField.value = field;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => { copiedField.value = null; }, 2_000);
}
</script>
