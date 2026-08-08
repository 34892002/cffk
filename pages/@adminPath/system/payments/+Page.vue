<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions>
        <Button variant="outline" size="sm" :disabled="loading" @click="loadProviders">
          <RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新
        </Button>
      </template>
    </AdminPageHeader>


    <Card>
      <CardHeader>
        <CardTitle>支付渠道</CardTitle>
        <CardDescription>配置保存在 D1。敏感字段只显示是否已配置，不返回原值。</CardDescription>
      </CardHeader>
      <CardContent>
        <AdminDataTable :columns="columns" :rows="providers" row-key="provider" empty-text="尚未初始化支付渠道。">
          <template #cell-provider="{ value }"><span class="font-mono text-xs">{{ value }}</span></template>
          <template #cell-modes="{ value }">{{ value || "默认" }}</template>
          <template #cell-configStatus="{ value }"><Badge :variant="value === 'valid' ? 'secondary' : 'destructive'">{{ value === "valid" ? "配置有效" : "配置不完整" }}</Badge></template>
          <template #cell-isEnabled="{ value }"><Badge :variant="value ? 'secondary' : 'outline'">{{ value ? "已启用" : "未启用" }}</Badge></template>
          <template #cell-updatedAt="{ value }"><span class="text-xs">{{ value ? formatDate(value) : "-" }}</span></template>
          <template #actions="{ row }"><Button variant="outline" size="sm" @click="openEditor(row)">配置</Button></template>
        </AdminDataTable>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>支付日志</CardTitle><CardDescription>仅展示已脱敏的支付事件与验证结果。</CardDescription></CardHeader>
      <CardContent class="grid gap-4">
        <label class="grid max-w-56 gap-2 text-sm font-medium">支付渠道
          <Select v-model="logProvider"><SelectTrigger><SelectValue placeholder="全部渠道" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部渠道</SelectItem><SelectItem v-for="item in providers" :key="item.provider" :value="item.provider">{{ item.title }}</SelectItem></SelectContent></Select>
        </label>
        <AdminDataTable :columns="logColumns" :rows="logs" row-key="id" empty-text="暂无支付日志。"><template #cell-orderNo="{ value }"><span class="font-mono text-xs">{{ value || "-" }}</span></template><template #cell-createdAt="{ value }"><span class="text-xs">{{ formatDate(value) }}</span></template></AdminDataTable>
        <Pagination v-model:page="logPage" v-model:page-size="logPageSize" :total="logTotal" />
      </CardContent>
    </Card>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b px-6 py-5 pr-14">
          <DialogTitle>配置{{ editing?.title ?? "支付渠道" }}</DialogTitle>
          <DialogDescription>配置直接保存在 D1。敏感字段编辑时不会回显，留空将保留现有值。</DialogDescription>
        </DialogHeader>
        <form v-if="editing" class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="saveProvider">
          <div class="overflow-y-auto px-6 py-5">
            <FieldSet class="gap-4">
              <FieldLegend>基础设置</FieldLegend>
              <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field><FieldLabel for="payment-provider-name">渠道名称</FieldLabel><Input id="payment-provider-name" v-model="form.name" autocomplete="off" /></Field>
                <Field orientation="horizontal" class="h-9 whitespace-nowrap sm:w-32"><FieldLabel for="payment-provider-enabled">启用渠道</FieldLabel><Switch id="payment-provider-enabled" v-model:checked="form.isEnabled" /></Field>
              </div>
            </FieldSet>
            <FieldSet class="mt-6 gap-4">
              <FieldLegend>连接参数</FieldLegend>
              <div class="grid gap-x-4 gap-y-5 sm:grid-cols-2"><JsonFormFields :fields="editing.fields" :values="form.values" :secrets="form.secrets" @update:values="form.values = $event" /></div>
            </FieldSet>
            <FieldSet v-if="configuredSecretFields.length" class="mt-6 gap-3">
              <FieldLegend>敏感配置</FieldLegend>
              <FieldDescription>勾选后将在保存时清除对应的 D1 配置。</FieldDescription>
              <div class="grid gap-3 sm:grid-cols-2"><Field v-for="field in configuredSecretFields" :key="field.key" orientation="horizontal"><Checkbox :id="`clear-${field.key}`" v-model="form.clearSecrets[field.key]" /><FieldLabel :for="`clear-${field.key}`">清除 {{ field.label }}</FieldLabel></Field></div>
            </FieldSet>
          </div>
          <DialogFooter class="border-t bg-background px-6 py-4"><Button type="button" variant="outline" :disabled="saving" @click="testProvider">校验配置</Button><DialogClose as-child><Button type="button" variant="outline" :disabled="saving">取消</Button></DialogClose><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存配置" }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import JsonFormFields from "@/components/admin/JsonFormFields.vue";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { runTelefunc } from "@/lib/telefunc-client";
import { onGetPaymentLogs, onGetPaymentProviders, onSavePaymentProvider, onValidatePaymentProviderConfig } from "@/server/payment/admin.telefunc";
import type { PaymentProviderKind } from "@/server/payment/registry";

type Provider = Awaited<ReturnType<typeof onGetPaymentProviders>>[number];
type ProviderField = Provider["fields"][number];
const columns: AdminTableColumn<Provider>[] = [
  { key: "provider", label: "渠道" }, { key: "name", label: "名称" }, { key: "modes", label: "子渠道" },
  { key: "configStatus", label: "配置状态" }, { key: "isEnabled", label: "状态" }, { key: "updatedAt", label: "更新时间" },
];
type PaymentLog = Awaited<ReturnType<typeof onGetPaymentLogs>>["rows"][number];
const logColumns: AdminTableColumn<PaymentLog>[] = [{ key: "createdAt", label: "时间" }, { key: "provider", label: "渠道" }, { key: "orderNo", label: "订单" }, { key: "eventType", label: "事件" }, { key: "verifyStatus", label: "验证" }, { key: "message", label: "结果" }];
const providers = ref<Provider[]>([]);
const logs = ref<PaymentLog[]>([]);
const logProvider = ref<"ALL" | PaymentProviderKind>("ALL");
const logPage = ref(1);
const logPageSize = ref(20);
const logTotal = ref(0);
const loading = ref(false);
const saving = ref(false);

const dialogOpen = ref(false);
const editing = ref<Provider | null>(null);
type FormValue = string | number | boolean | string[];
const form = reactive<{ name: string; isEnabled: boolean; values: Record<string, FormValue>; secrets: Record<string, { configured: boolean }>; clearSecrets: Record<string, boolean> }>({ name: "", isEnabled: false, values: {}, secrets: {}, clearSecrets: {} });
const configuredSecretFields = computed(() => editing.value?.fields.filter((field) => field.secret && form.secrets[field.key]?.configured) ?? []);

async function loadProviders() {
  loading.value = true;
  try { const [providerRows, logResult] = await Promise.all([runTelefunc(() => onGetPaymentProviders()), runTelefunc(() => onGetPaymentLogs({ provider: logProvider.value === "ALL" ? undefined : logProvider.value, page: logPage.value, pageSize: logPageSize.value }))]); providers.value = providerRows; logs.value = logResult.rows; logTotal.value = logResult.total; }
  catch {
    // runTelefunc has already shown the fixed, user-facing error toast.
  }
  finally { loading.value = false; }
}
function openEditor(provider: Provider) {
  editing.value = provider; form.name = provider.name; form.isEnabled = provider.isEnabled;
  form.values = Object.fromEntries(Object.entries(provider.values).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
  form.secrets = provider.secrets; form.clearSecrets = {}; dialogOpen.value = true;
}
function paymentProviderPayload() {
  if (!editing.value) return null;
  const secretUpdates: Record<string, { action: "keepExisting" } | { action: "value"; value: string } | { action: "clear" }> = {};
  const values = { ...form.values };
  for (const field of editing.value.fields as ProviderField[]) if (field.secret) {
    const value = values[field.key];
    secretUpdates[field.key] = form.clearSecrets[field.key] ? { action: "clear" } : value ? { action: "value", value: String(value) } : { action: "keepExisting" };
    delete values[field.key];
  }
  return { provider: editing.value.provider as PaymentProviderKind, values, secretUpdates };
}
async function testProvider() {
  const payload = paymentProviderPayload();
  if (!payload) return;
  saving.value = true;
  try { await runTelefunc(() => onValidatePaymentProviderConfig(payload), { successMessage: "支付配置校验通过。" }); }
  catch {
    // runTelefunc has already shown the fixed, user-facing error toast.
  }
  finally { saving.value = false; }
}
function formatDate(value: unknown) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(typeof value === "string" || typeof value === "number" || value instanceof Date ? value : 0)); }
async function saveProvider() {
  if (!editing.value) return;
  const payload = paymentProviderPayload();
  if (!payload) return;
  saving.value = true;
  try {
    await runTelefunc(() => onSavePaymentProvider({ ...payload, name: form.name, isEnabled: form.isEnabled }), { successMessage: "支付渠道配置已保存。" });
    dialogOpen.value = false; await loadProviders();
  } catch {
    // runTelefunc has already shown the fixed, user-facing error toast.
  }
  finally { saving.value = false; }
}
watch([logProvider, logPage, logPageSize], ([provider, _page, pageSize], [previousProvider, previousPageSize]) => {
  if (provider !== previousProvider || pageSize !== previousPageSize) logPage.value = 1;
  void loadProviders();
});
onMounted(() => { void loadProviders(); });
</script>
