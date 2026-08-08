<template>
  <MailSettingsLayout>
    <div class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div><h2 class="text-xl font-semibold tracking-normal">通道配置</h2><p class="mt-1 text-sm text-muted-foreground">添加并管理邮件邮局。启用一个配置后，其他配置会自动停用。</p></div>
        <div class="flex gap-2"><Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadProviders"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button><Button size="sm" :disabled="!definitions.length" @click="startCreate">新增邮局</Button></div>
      </div>

      <Card class="gap-4 py-4">
        <CardHeader class="px-5"><CardTitle>邮局列表</CardTitle><CardDescription>支持 API、SMTP 及 Cloudflare 模式。Cloudflare 需配置 Wrangler send_email 绑定；发送异常可前往“投递日志”排查。</CardDescription></CardHeader><CardContent class="px-5">
          <div v-if="!loading && !providers.length" class="py-6 text-center text-sm text-muted-foreground">暂无邮局配置，请点击“新增邮局”。</div>
          <div v-else class="grid gap-2">
            <div v-for="item in providers" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
              <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="font-medium">{{ providerLabel(item.provider) }}</span><Badge :variant="item.isEnabled ? 'secondary' : 'outline'">{{ item.isEnabled ? '已启用' : '未启用' }}</Badge></div><p class="mt-0.5 text-sm text-muted-foreground">{{ item.name }}</p></div>
              <div class="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" @click="editProvider(item)">编辑</Button><Button size="sm" variant="outline" :disabled="sendingTest" @click="selectTestProvider(item)">测试</Button><Button size="sm" variant="destructive" :disabled="item.isEnabled" @click="requestDelete(item)">删除</Button><Switch :model-value="item.isEnabled" :disabled="changingProviderId === item.id || item.provider === 'CLOUDFLARE'" :aria-label="`${providerLabel(item.provider)}启用状态`" @update:model-value="toggleProvider(item, $event === true)" /></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="formVisible">
      <DialogContent class="max-h-[calc(100dvh-2rem)] sm:max-w-215 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b px-6 py-5 pr-14">
          <DialogTitle>{{ editingId ? '编辑邮局' : '新增邮局' }}</DialogTitle><DialogDescription>敏感字段只接受 Worker Secret 名称，编辑时不会回显已有名称。</DialogDescription>
        </DialogHeader>
        <form v-if="currentDefinition" class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="saveProvider">
          <div class="overflow-y-auto px-6 py-5">
            <div class="grid gap-6">
              <FieldSet class="gap-4">
                <FieldLegend>基础设置</FieldLegend>
                <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field><FieldLabel for="provider-name">邮局名称</FieldLabel><Input id="provider-name" v-model="name" required /></Field>
                  <Field><FieldLabel for="provider-kind">邮件类型</FieldLabel><Select v-model="provider" :disabled="Boolean(editingId)" @update:model-value="resetValues"><SelectTrigger id="provider-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="definition in definitions" :key="definition.provider" :value="definition.provider">{{ definition.title }}</SelectItem></SelectContent></Select></Field>
                  <Field orientation="horizontal" class="h-9 whitespace-nowrap sm:w-40"><FieldLabel for="provider-enabled">保存后启用</FieldLabel><Switch id="provider-enabled" v-model="isEnabled" /></Field>
                </div>
              </FieldSet>
              <FieldSet class="gap-4">
                <FieldLegend>连接参数</FieldLegend>
                <div class="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field v-for="field in currentDefinition.fields" :key="field.key" :class="field.type === 'textarea' ? 'sm:col-span-2' : ''">
                    <Field v-if="field.type === 'switch'" orientation="horizontal"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Switch :id="`field-${field.key}`" :model-value="values[field.key] === true" @update:model-value="values[field.key] = $event" /></Field>
                    <template v-else-if="field.type === 'select'"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Select :model-value="textValue(field.key)" @update:model-value="setTextValue(field.key, $event)"><SelectTrigger :id="`field-${field.key}`"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select></template>
                    <template v-else-if="field.type === 'textarea'"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Textarea :id="`field-${field.key}`" :model-value="textValue(field.key)" rows="3" :placeholder="field.placeholder" @update:model-value="setTextValue(field.key, $event)" /></template>
                    <template v-else-if="field.secret"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Input :id="`field-${field.key}`" v-model="secretValues[field.key]" type="password" autocomplete="off" :placeholder="secrets[field.key]?.configured ? '留空以保留现有配置' : field.placeholder" /><FieldDescription>{{ secrets[field.key]?.configured ? '已配置（已脱敏）' : field.description }}<label v-if="secrets[field.key]?.configured" class="mt-2 flex items-center gap-2"><Checkbox :model-value="clearSecrets[field.key] === true" @update:model-value="clearSecrets[field.key] = $event === true" />清除现有配置</label></FieldDescription></template>
                    <template v-else><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Input :id="`field-${field.key}`" :model-value="textValue(field.key)" :type="field.type" :required="field.required" :min="field.min" :max="field.max" :placeholder="field.placeholder" @update:model-value="setInputValue(field.key, field.type, $event)" /></template>
                    <FieldDescription v-if="field.description && !field.secret">{{ field.description }}</FieldDescription>
                  </Field>
                </div>
              </FieldSet>
            </div>
          </div>
          <DialogFooter class="border-t px-6 py-4"><Button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存配置' }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="testDialogOpen">
      <DialogContent @interact-outside.prevent>
        <DialogHeader class="pr-8"><DialogTitle>发送测试邮件</DialogTitle><DialogDescription>测试邮件不受业务推送策略影响，结果会写入统一投递历史。</DialogDescription></DialogHeader>
        <form class="grid gap-4" novalidate @submit.prevent="sendTestEmail">
          <Field><FieldLabel>使用邮局</FieldLabel><div class="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{{ testProviderName }}</div></Field>
          <Field><FieldLabel for="test-recipient">收件人邮箱</FieldLabel><Input id="test-recipient" v-model="testForm.to" type="email" required /></Field>
          <Field><FieldLabel for="test-content">测试内容</FieldLabel><Textarea id="test-content" v-model="testForm.customContent" rows="4" /></Field>
          <DialogFooter><DialogClose as-child><Button type="button" variant="outline" :disabled="sendingTest">取消</Button></DialogClose><Button type="submit" :disabled="sendingTest || !testProviderId">{{ sendingTest ? '发送中...' : '发送测试邮件' }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader class="pr-8"><DialogTitle>删除邮件 Provider？</DialogTitle><DialogDescription>将永久删除“{{ providerToDelete?.name }}”及其配置。此操作不可恢复，已启用的配置不能删除。</DialogDescription></DialogHeader>
        <DialogFooter><DialogClose as-child><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" :disabled="deleting" @click="removeProvider">{{ deleting ? '删除中...' : '确认删除' }}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </MailSettingsLayout>
</template>

<script lang="ts" setup>
import { RefreshCwIcon } from "@lucide/vue";
import { computed, onMounted, reactive, ref } from "vue";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
import { runTelefunc } from "@/lib/telefunc-client";
import { onDeleteEmailProvider, onGetEmailProviderDefinitions, onGetEmailProviders, onSaveEmailProvider, onSendTestEmail, onSetEmailProviderEnabled } from "@/server/email/admin.telefunc";

type Provider = Awaited<ReturnType<typeof onGetEmailProviders>>[number];
type Definition = Awaited<ReturnType<typeof onGetEmailProviderDefinitions>>[number];
type Kind = Definition["provider"];
const providers = ref<Provider[]>([]); const definitions = ref<Definition[]>([]); const loading = ref(false); const saving = ref(false); const sendingTest = ref(false); const deleting = ref(false); const changingProviderId = ref<number | null>(null); const formVisible = ref(false); const editingId = ref<number | undefined>(); const testProviderId = ref<number | undefined>(); const testDialogOpen = ref(false); const deleteDialogOpen = ref(false); const providerToDelete = ref<Provider | null>(null);
const name = ref(""); const isEnabled = ref(false); const provider = ref<Kind>("API"); const values = reactive<Record<string, string | number | boolean>>({}); const secretValues = reactive<Record<string, string>>({}); const clearSecrets = reactive<Record<string, boolean>>({}); const secrets = reactive<Record<string, { configured: boolean; masked?: string }>>({});
const testForm = reactive({ to: "", customContent: "" });
const currentDefinition = computed(() => definitions.value.find((item) => item.provider === provider.value));
const testProviderName = computed(() => providers.value.find((item) => item.id === testProviderId.value)?.name ?? "");
function textValue(key: string) { const value = values[key]; return typeof value === "string" || typeof value === "number" ? value : ""; }
function setTextValue(key: string, value: unknown) { values[key] = typeof value === "string" ? value : ""; }
function setInputValue(key: string, type: string, value: unknown) { const text = typeof value === "string" ? value : ""; values[key] = type === "number" ? Number(text) : text; }
function replaceRecord<T>(target: Record<string, T>, source: Record<string, T>) { for (const key of Object.keys(target)) delete target[key]; Object.assign(target, source); }
function resetValues() { const definition = currentDefinition.value; if (!definition) return; replaceRecord(values, { ...definition.defaults }); replaceRecord(secretValues, {}); replaceRecord(clearSecrets, {}); replaceRecord(secrets, {}); }
function startCreate() { name.value = ""; isEnabled.value = false; editingId.value = undefined; provider.value = definitions.value[0]?.provider ?? "API"; resetValues(); formVisible.value = true; }
function editProvider(item: Provider) { if (item.provider !== "API" && item.provider !== "SMTP" && item.provider !== "CLOUDFLARE") return; editingId.value = item.id; name.value = item.name; isEnabled.value = item.isEnabled; provider.value = item.provider; replaceRecord(values, item.values as Record<string, string | number | boolean>); replaceRecord(secretValues, {}); replaceRecord(clearSecrets, {}); replaceRecord(secrets, item.secrets); formVisible.value = true; }
function providerLabel(provider: Provider["provider"]) { return provider === "API" ? "API" : provider === "SMTP" ? "SMTP" : provider === "CLOUDFLARE" ? "Cloudflare Email Sending" : provider; }

async function loadProviders() { loading.value = true; try { providers.value = await runTelefunc(() => onGetEmailProviders()); if (!providers.value.some((item) => item.id === testProviderId.value)) testProviderId.value = providers.value.find((item) => item.isEnabled)?.id ?? providers.value[0]?.id; } finally { loading.value = false; } }
async function loadDefinitions() { definitions.value = await runTelefunc(() => onGetEmailProviderDefinitions()); }
async function saveProvider() { saving.value = true; try { const secretUpdates = Object.fromEntries(currentDefinition.value?.fields.filter((field) => field.secret).map((field) => [field.key, clearSecrets[field.key] ? { clear: true } : secretValues[field.key]?.trim() ? { value: secretValues[field.key].trim() } : secrets[field.key]?.configured ? { keepExisting: true } : {}]) ?? []); await runTelefunc(() => onSaveEmailProvider({ id: editingId.value, channel: "EMAIL", provider: provider.value, name: name.value, isEnabled: isEnabled.value, values, secrets: secretUpdates }), { successMessage: "邮件邮局已保存。" }); formVisible.value = false; await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } }
async function toggleProvider(item: Provider, enabled: boolean) { changingProviderId.value = item.id; try { await runTelefunc(() => onSetEmailProviderEnabled(item.id, enabled), { successMessage: enabled ? "邮件 Provider 已启用。" : "邮件 Provider 已停用。" }); await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { changingProviderId.value = null; } }
function requestDelete(item: Provider) { providerToDelete.value = item; deleteDialogOpen.value = true; }
async function removeProvider() { const item = providerToDelete.value; if (!item) return; deleting.value = true; try { await runTelefunc(() => onDeleteEmailProvider(item.id), { successMessage: "邮件 Provider 已删除。" }); deleteDialogOpen.value = false; providerToDelete.value = null; await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { deleting.value = false; } }
function selectTestProvider(item: Provider) { testProviderId.value = item.id; testDialogOpen.value = true; }
async function sendTestEmail() { if (!testProviderId.value) return; sendingTest.value = true; try { await runTelefunc(() => onSendTestEmail({ to: testForm.to, providerConfigId: testProviderId.value, customContent: testForm.customContent }), { successMessage: "测试邮件已发送。" }); testDialogOpen.value = false; } catch { /* runTelefunc owns feedback */ } finally { sendingTest.value = false; } }
onMounted(async () => { try { await loadDefinitions(); await loadProviders(); } catch { /* runTelefunc owns feedback */ } });
</script>
