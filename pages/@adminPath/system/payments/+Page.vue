<template>
  <PaymentSettingsLayout>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h2 class="text-xl font-semibold tracking-normal">支付渠道</h2><p class="mt-1 text-sm text-muted-foreground">配置支付 Provider、回调地址和返回地址。</p></div>
      <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadProviders"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
    </div>
    <Card class="mt-4">
      <CardHeader v-if="!siteUrlMissing">
        <CardTitle>支付渠道列表</CardTitle>
        <CardDescription>配置保存在 D1。敏感字段只显示是否已配置，不返回原值。</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty v-if="siteUrlMissing">
          <EmptyHeader>
            <EmptyMedia variant="icon" class="bg-orange-500/10 text-orange-600 dark:text-orange-400"><TriangleAlertIcon /></EmptyMedia>
            <EmptyTitle>请先配置网站地址</EmptyTitle>
            <EmptyDescription>支付回调地址和返回地址必须使用本站域名。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button as-child><a :href="siteSettingsPath">前往站点配置</a></Button></EmptyContent>
        </Empty>
        <AdminDataTable v-else :columns="columns" :rows="providers" row-key="provider" empty-text="尚未初始化支付渠道。"><template #cell-provider="{ value }"><span class="font-mono text-xs">{{ value }}</span></template><template #cell-modes="{ value }">{{ value || "默认" }}</template><template #cell-valid="{ value }"><Badge :variant="value ? 'secondary' : 'outline'" :class="value ? undefined : 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'">{{ value ? "配置有效" : "配置不完整" }}</Badge></template><template #cell-isEnabled="{ value }"><Badge :variant="value ? 'secondary' : 'outline'">{{ value ? "已启用" : "未启用" }}</Badge></template><template #cell-updatedAt="{ value }"><span class="text-xs">{{ value ? formatDate(value) : "-" }}</span></template><template #actions="{ row }"><Button variant="outline" size="sm" @click="openEditor(row)">配置</Button></template></AdminDataTable>
      </CardContent>
    </Card>

    <Dialog v-model:open="dialogOpen"><DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent><DialogHeader class="border-b px-6 py-5 pr-14"><DialogTitle>配置{{ editing?.title ?? "支付渠道" }}</DialogTitle><DialogDescription>配置直接保存在 D1。敏感字段编辑时不会回显，留空将保留现有值。</DialogDescription></DialogHeader><form v-if="editing" class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="saveProvider"><div class="overflow-y-auto px-6 py-5"><FieldSet class="gap-4"><FieldLegend>基础设置</FieldLegend><div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field><FieldLabel for="payment-provider-name">渠道名称</FieldLabel><Input id="payment-provider-name" v-model="form.name" autocomplete="off" /></Field><Field orientation="horizontal" class="h-9 whitespace-nowrap sm:w-32"><FieldLabel for="payment-provider-enabled">启用渠道</FieldLabel><Switch id="payment-provider-enabled" v-model="form.isEnabled" /></Field></div></FieldSet><FieldSet class="mt-6 gap-4"><FieldLegend>连接参数</FieldLegend><div class="grid gap-y-5"><JsonFormFields :fields="editing.fields" :values="form.values" :configured-secrets="form.configuredSecrets" :errors="fieldErrors" @update:values="form.values = $event" /><PaymentUrlFields :provider="editing.provider" :show-notify="hasNotifyUrl" :notify-url="urlValue('notifyUrl')" :return-url="urlValue('returnUrl')" :site-url="editing.siteUrl" :errors="fieldErrors" @update:notify-url="form.values.notifyUrl = $event" @update:return-url="form.values.returnUrl = $event" /></div></FieldSet></div><DialogFooter class="border-t bg-background px-6 py-4"><Button type="button" variant="outline" :disabled="saving" @click="testProvider">校验配置</Button><DialogClose as-child><Button type="button" variant="outline" :disabled="saving">取消</Button></DialogClose><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存配置" }}</Button></DialogFooter></form></DialogContent></Dialog>
  </PaymentSettingsLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { toast } from "vue-sonner";
import { usePageContext } from "vike-vue/usePageContext";
import { RefreshCwIcon, TriangleAlertIcon } from "@lucide/vue";
import PaymentSettingsLayout from "@/components/admin/PaymentSettingsLayout.vue";
import PaymentUrlFields from "@/components/admin/PaymentUrlFields.vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import JsonFormFields from "@/components/admin/JsonFormFields.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { runTelefunc } from "@/lib/telefunc-client";
import { buildJsonFormSubmission, getJsonFormErrors, type JsonFormSubmitValues, type JsonFormValues } from "@/lib/json-form-values";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { onGetPaymentProviders, onSavePaymentProvider, onValidatePaymentProviderConfig } from "@/server/payment/admin.telefunc";
import type { PaymentProviderKind } from "@/server/payment/registry";

type Provider = Awaited<ReturnType<typeof onGetPaymentProviders>>[number];
const timezone = useSiteTimezone();
const columns: AdminTableColumn<Provider>[] = [{ key: "provider", label: "渠道" }, { key: "name", label: "名称" }, { key: "modes", label: "子渠道" }, { key: "valid", label: "配置状态" }, { key: "isEnabled", label: "状态" }, { key: "updatedAt", label: "更新时间" }];
const pageContext = usePageContext();
const siteSettingsPath = `/${pageContext.routeParams.adminPath}/system/settings`;
const providers = ref<Provider[]>([]); const loading = ref(false); const loaded = ref(false); const saving = ref(false); const dialogOpen = ref(false); const editing = ref<Provider | null>(null); const fieldErrors = ref<Record<string, string>>({});
const form = reactive<{ name: string; isEnabled: boolean; values: JsonFormValues; configuredSecrets: string[] }>({ name: "", isEnabled: false, values: {}, configuredSecrets: [] });
const hasNotifyUrl = computed(() => editing.value?.fields.some((field) => field.key === "notifyUrl") ?? false); const siteUrlMissing = computed(() => loaded.value && !providers.value[0]?.siteUrl);
function urlValue(key: "notifyUrl" | "returnUrl") { const value = form.values[key]; return typeof value === "string" ? value : ""; }
async function loadProviders() { loading.value = true; try { providers.value = await runTelefunc(() => onGetPaymentProviders()); } catch { /* runTelefunc owns feedback */ } finally { loaded.value = true; loading.value = false; } }
function openEditor(provider: Provider) { editing.value = provider; form.name = provider.name; form.isEnabled = provider.isEnabled; form.values = Object.fromEntries(Object.entries(provider.values).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) as JsonFormValues; form.configuredSecrets = [...provider.configuredSecrets]; fieldErrors.value = {}; dialogOpen.value = true; }
function paymentProviderPayload() { if (!editing.value) return null; const values: JsonFormSubmitValues = buildJsonFormSubmission(editing.value.fields, form.values); return { provider: editing.value.provider as PaymentProviderKind, values }; }
function validateForm() { if (!editing.value) return false; fieldErrors.value = getJsonFormErrors(editing.value.fields, form.values, form.configuredSecrets); const messages = Object.values(fieldErrors.value); if (messages.length) toast.error(`支付配置未完成：${messages.join(" ")}`); return messages.length === 0; }
async function testProvider() { if (!validateForm()) return; const payload = paymentProviderPayload(); if (!payload) return; saving.value = true; try { await runTelefunc(() => onValidatePaymentProviderConfig(payload), { successMessage: "支付配置校验通过。" }); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } }
function formatDate(value: unknown) { return formatDateInTimezone(typeof value === "string" || typeof value === "number" || value instanceof Date ? value : 0, timezone.value); }
async function saveProvider() { if (!editing.value || !validateForm()) return; const payload = paymentProviderPayload(); if (!payload) return; saving.value = true; try { await runTelefunc(() => onSavePaymentProvider({ ...payload, name: form.name, isEnabled: form.isEnabled }), { successMessage: "支付渠道配置已保存。" }); dialogOpen.value = false; await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } }
onMounted(() => { void loadProviders(); });
</script>
