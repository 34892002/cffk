<template>
  <section class="flex w-full flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">支付渠道</h1>
        <p class="mt-1 text-sm text-muted-foreground">渠道配置以 JSON 保存，私钥仅引用 Worker Secret 名称。</p>
      </div>
      <Button :disabled="loading" @click="loadProviders">刷新数据</Button>
    </div>

    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Card v-for="item in providers" :key="item.provider">
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>{{ item.name }}</CardTitle><CardDescription class="mt-1 font-mono">{{ item.provider }}</CardDescription></div>
          <Badge :variant="item.isEnabled ? 'secondary' : 'outline'">{{ item.isEnabled ? '已启用' : '未启用' }}</Badge>
        </div>
      </CardHeader>
      <form @submit.prevent="saveProvider(item.provider)">
        <CardContent class="grid max-w-3xl gap-4">
          <label class="grid gap-2 text-sm font-medium">显示名称<Input v-model="forms[item.provider].name" required /></label>
          <label class="flex items-center gap-2 text-sm font-medium"><Checkbox v-model="forms[item.provider].isEnabled" class="size-4" /> 启用此渠道</label>
          <label class="grid gap-2 text-sm font-medium">配置 JSON
            <Textarea v-model="forms[item.provider].configJson" rows="10" spellcheck="false" class="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <p class="text-xs leading-5 text-muted-foreground">支付宝使用单一 `ALIPAY` 记录，`mode` 为 `web` 或 `face_to_face`。`privateKey` 与 `alipayPublicKey` 必须为 `{ "secret": "WORKER_SECRET_NAME" }`，不可填写密钥原文。</p>
        </CardContent>
        <CardFooter><Button type="submit" :disabled="savingProvider === item.provider">{{ savingProvider === item.provider ? '保存中...' : '保存配置' }}</Button></CardFooter>
      </form>
    </Card>

    <Card v-if="!loading && !providers.length"><CardContent class="py-10 text-center text-sm text-muted-foreground">尚未初始化支付渠道。请先执行数据库 seed。</CardContent></Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { onGetPaymentProviders, onSavePaymentProvider } from "@/server/payment/admin.telefunc";

type Provider = Awaited<ReturnType<typeof onGetPaymentProviders>>[number];
type Form = { name: string; isEnabled: boolean; configJson: string };

const providers = ref<Provider[]>([]);
const forms = reactive<Record<string, Form>>({});
const loading = ref(false);
const savingProvider = ref<string | null>(null);
const error = ref<string | null>(null);

async function loadProviders() {
  loading.value = true;
  error.value = null;
  try {
    providers.value = await onGetPaymentProviders();
    for (const item of providers.value) forms[item.provider] = { name: item.name, isEnabled: item.isEnabled, configJson: item.configJson };
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function saveProvider(provider: Provider["provider"]) {
  const form = forms[provider];
  if (!form) return;
  savingProvider.value = provider;
  error.value = null;
  try {
    await onSavePaymentProvider({ provider, ...form });
    await loadProviders();
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    savingProvider.value = null;
  }
}

function errorMessage(cause: unknown) {
  const code = cause instanceof Error ? cause.message : "";
  return {
    ADMIN_ACCESS_REQUIRED: "管理员身份已失效，请重新登录。",
    PAYMENT_PROVIDER_NAME_REQUIRED: "请填写支付渠道名称。",
    PAYMENT_PROVIDER_NOT_IMPLEMENTED: "此支付渠道尚未实现，不能保存或启用。",
  }[code] ?? "JSON 配置无效，请检查字段和 Worker Secret 引用。";
}

onMounted(loadProviders);
</script>
