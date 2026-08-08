<template>
  <MailSettingsLayout>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h2 class="text-xl font-semibold tracking-normal">通道配置</h2><p class="mt-1 text-sm text-muted-foreground">添加并管理邮件邮局。启用一个配置后，其他配置会自动停用。</p></div>
      <div class="flex gap-2"><Button variant="outline" :disabled="loading" @click="loadProviders">刷新数据</Button><Button :disabled="!definitions.length" @click="startCreate">新增邮局</Button></div>
    </div>
    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Card>
      <CardHeader><CardTitle>邮局列表</CardTitle><CardDescription>支持 API、SMTP 和 Cloudflare Email Sending。</CardDescription></CardHeader><CardContent>
        <div v-if="!loading && !providers.length" class="py-8 text-center text-sm text-muted-foreground">暂无邮局配置，请点击“新增邮局”。</div>
        <div v-else class="grid gap-3">
          <div v-for="item in providers" :key="item.id" class="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4">
            <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="font-medium">{{ item.name }}</span><Badge variant="outline">{{ item.provider }}</Badge><Badge :variant="item.isEnabled ? 'secondary' : 'outline'">{{ item.isEnabled ? '已启用' : '未启用' }}</Badge></div><p class="mt-1 text-sm text-muted-foreground">{{ summary(item) }}</p></div>
            <div class="flex flex-wrap gap-2"><Button size="sm" variant="outline" @click="editProvider(item)">编辑</Button><Button size="sm" variant="outline" :disabled="sendingTest" @click="selectTestProvider(item)">测试</Button><Button size="sm" :disabled="item.isEnabled" @click="toggleProvider(item, true)">{{ item.isEnabled ? '当前启用' : '启用' }}</Button><Button v-if="!item.isEnabled" size="sm" variant="destructive" @click="requestDelete(item)">删除</Button></div>
          </div>
        </div>
      </CardContent>
    </Card>

    <DialogRoot v-model:open="formVisible">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-background shadow-lg" @interact-outside.prevent @escape-key-down.prevent>
          <div class="flex items-start justify-between gap-4 border-b p-6">
            <div class="min-w-0"><DialogTitle class="text-lg font-semibold">{{ editingId ? '编辑邮局' : '新增邮局' }}</DialogTitle><DialogDescription class="mt-1 text-sm text-muted-foreground">敏感字段只接受 Worker Secret 名称，编辑时不会回显已有名称。</DialogDescription></div>
            <DialogClose as-child><Button variant="ghost" size="sm" :disabled="saving">关闭</Button></DialogClose>
          </div>
          <form v-if="currentDefinition" class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="saveProvider">
            <div class="overflow-y-auto p-6">
              <div class="grid gap-5">
                <FieldGroup><Field><FieldLabel for="provider-name">邮局名称</FieldLabel><Input id="provider-name" v-model="name" required /></Field><Field orientation="horizontal"><FieldLabel for="provider-enabled">保存后启用</FieldLabel><Switch id="provider-enabled" v-model="isEnabled" /></Field><Field><FieldLabel for="provider-kind">邮件类型</FieldLabel><Select v-model="provider" :disabled="Boolean(editingId)" @update:model-value="resetValues"><SelectTrigger id="provider-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="definition in definitions" :key="definition.provider" :value="definition.provider">{{ definition.title }}</SelectItem></SelectContent></Select></Field></FieldGroup>
                <FieldSet>
                  <FieldLegend>连接参数</FieldLegend><FieldGroup>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <Field v-for="field in currentDefinition.fields" :key="field.key" :class="field.type === 'textarea' ? 'sm:col-span-2' : ''">
                        <Field v-if="field.type === 'switch'" orientation="horizontal"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Switch :id="`field-${field.key}`" :model-value="values[field.key] === true" @update:model-value="values[field.key] = $event" /></Field>
                        <template v-else-if="field.type === 'select'"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Select :model-value="textValue(field.key)" @update:model-value="setTextValue(field.key, $event)"><SelectTrigger :id="`field-${field.key}`"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select></template>
                        <template v-else-if="field.type === 'textarea'"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Textarea :id="`field-${field.key}`" :model-value="textValue(field.key)" rows="3" :placeholder="field.placeholder" @update:model-value="setTextValue(field.key, $event)" /></template>
                        <template v-else-if="field.secret"><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Input :id="`field-${field.key}`" v-model="secretValues[field.key]" type="password" autocomplete="off" :placeholder="secrets[field.key]?.configured ? '留空以保留现有配置' : field.placeholder" /><FieldDescription>{{ secrets[field.key]?.configured ? '已配置（已脱敏）' : field.description }}<label v-if="secrets[field.key]?.configured" class="mt-2 flex items-center gap-2"><Checkbox :model-value="clearSecrets[field.key] === true" @update:model-value="clearSecrets[field.key] = $event === true" />清除现有配置</label></FieldDescription></template>
                        <template v-else><FieldLabel :for="`field-${field.key}`">{{ field.label }}</FieldLabel><Input :id="`field-${field.key}`" :model-value="textValue(field.key)" :type="field.type" :required="field.required" :min="field.min" :max="field.max" :placeholder="field.placeholder" @update:model-value="setInputValue(field.key, field.type, $event)" /></template>
                        <FieldDescription v-if="field.description && !field.secret">{{ field.description }}</FieldDescription>
                      </Field>
                    </div>
                  </FieldGroup>
                </FieldSet>
              </div>
            </div>
            <CardFooter class="border-t px-6 py-4"><Button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存配置' }}</Button></CardFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="deleteDialogOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg">
          <DialogTitle class="text-lg font-semibold">删除邮件 Provider？</DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">将永久删除“{{ providerToDelete?.name }}”及其配置。此操作不可恢复，已启用的配置不能删除。</DialogDescription>
          <div class="flex justify-end gap-2"><DialogClose as-child><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" :disabled="deleting" @click="removeProvider">{{ deleting ? '删除中...' : '确认删除' }}</Button></div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <Card><CardHeader><CardTitle>发送测试邮件</CardTitle><CardDescription>测试邮件不受业务推送策略影响，结果会写入统一投递历史。</CardDescription></CardHeader><form novalidate @submit.prevent="sendTestEmail"><CardContent class="grid max-w-3xl gap-4"><Field><FieldLabel for="test-provider">使用邮局</FieldLabel><Select v-model="testProviderId"><SelectTrigger id="test-provider"><SelectValue placeholder="选择邮件邮局" /></SelectTrigger><SelectContent><SelectItem v-for="item in providers" :key="item.id" :value="item.id">{{ item.name }}{{ item.isEnabled ? '（当前启用）' : '' }}</SelectItem></SelectContent></Select></Field><Field><FieldLabel for="test-recipient">收件人邮箱</FieldLabel><Input id="test-recipient" v-model="testForm.to" type="email" required /></Field><Field><FieldLabel for="test-content">测试内容</FieldLabel><Textarea id="test-content" v-model="testForm.customContent" rows="4" /></Field></CardContent><CardFooter><Button type="submit" :disabled="sendingTest || !testProviderId">{{ sendingTest ? '发送中...' : '发送测试邮件' }}</Button></CardFooter></form></Card>
  </MailSettingsLayout>
</template>

<script lang="ts" setup>
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { computed, onMounted, reactive, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onDeleteEmailProvider, onGetEmailProviderDefinitions, onGetEmailProviders, onSaveEmailProvider, onSendTestEmail, onSetEmailProviderEnabled } from "@/server/email/admin.telefunc";

type Provider = Awaited<ReturnType<typeof onGetEmailProviders>>[number];
type Definition = Awaited<ReturnType<typeof onGetEmailProviderDefinitions>>[number];
type Kind = Definition["provider"];
const providers = ref<Provider[]>([]); const definitions = ref<Definition[]>([]); const loading = ref(false); const saving = ref(false); const sendingTest = ref(false); const deleting = ref(false); const error = ref<string | null>(null); const formVisible = ref(false); const editingId = ref<number | undefined>(); const testProviderId = ref<number | undefined>(); const deleteDialogOpen = ref(false); const providerToDelete = ref<Provider | null>(null);
const name = ref(""); const isEnabled = ref(false); const provider = ref<Kind>("API"); const values = reactive<Record<string, string | number | boolean>>({}); const secretValues = reactive<Record<string, string>>({}); const clearSecrets = reactive<Record<string, boolean>>({}); const secrets = reactive<Record<string, { configured: boolean; masked?: string }>>({});
const testForm = reactive({ to: "", customContent: "" });
const currentDefinition = computed(() => definitions.value.find((item) => item.provider === provider.value));
function textValue(key: string) { const value = values[key]; return typeof value === "string" || typeof value === "number" ? value : ""; }
function setTextValue(key: string, value: unknown) { values[key] = typeof value === "string" ? value : ""; }
function setInputValue(key: string, type: string, value: unknown) { const text = typeof value === "string" ? value : ""; values[key] = type === "number" ? Number(text) : text; }
function replaceRecord<T>(target: Record<string, T>, source: Record<string, T>) { for (const key of Object.keys(target)) delete target[key]; Object.assign(target, source); }
function resetValues() { const definition = currentDefinition.value; if (!definition) return; replaceRecord(values, { ...definition.defaults }); replaceRecord(secretValues, {}); replaceRecord(clearSecrets, {}); replaceRecord(secrets, {}); }
function startCreate() { name.value = ""; isEnabled.value = false; editingId.value = undefined; provider.value = definitions.value[0]?.provider ?? "API"; resetValues(); formVisible.value = true; }
function editProvider(item: Provider) { if (item.provider !== "API" && item.provider !== "SMTP" && item.provider !== "CLOUDFLARE") return; editingId.value = item.id; name.value = item.name; isEnabled.value = item.isEnabled; provider.value = item.provider; replaceRecord(values, item.values as Record<string, string | number | boolean>); replaceRecord(secretValues, {}); replaceRecord(clearSecrets, {}); replaceRecord(secrets, item.secrets); formVisible.value = true; }
function summary(item: Provider) { if (item.configurationError) return "配置需要检查"; const values = item.values as Record<string, unknown>; return item.provider === "API" ? String(values.apiProvider || values.endpoint || "API") : item.provider === "SMTP" ? String(values.host || "SMTP") : String(values.binding || "Cloudflare"); }
async function loadProviders() { loading.value = true; error.value = null; try { providers.value = await runTelefunc(() => onGetEmailProviders(), { notifyError: false }); if (!providers.value.some((item) => item.id === testProviderId.value)) testProviderId.value = providers.value.find((item) => item.isEnabled)?.id ?? providers.value[0]?.id; } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; } }
async function loadDefinitions() { definitions.value = await runTelefunc(() => onGetEmailProviderDefinitions(), { notifyError: false }); }
async function saveProvider() { saving.value = true; try { const secretUpdates = Object.fromEntries(currentDefinition.value?.fields.filter((field) => field.secret).map((field) => [field.key, clearSecrets[field.key] ? { clear: true } : secretValues[field.key]?.trim() ? { value: secretValues[field.key].trim() } : secrets[field.key]?.configured ? { keepExisting: true } : {}]) ?? []); await runTelefunc(() => onSaveEmailProvider({ id: editingId.value, channel: "EMAIL", provider: provider.value, name: name.value, isEnabled: isEnabled.value, values, secrets: secretUpdates }), { successMessage: "邮件邮局已保存。" }); formVisible.value = false; await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } }
async function toggleProvider(item: Provider, enabled: boolean) { try { await runTelefunc(() => onSetEmailProviderEnabled(item.id, enabled), { successMessage: enabled ? "邮件 Provider 已启用。" : "邮件 Provider 已停用。" }); await loadProviders(); } catch { /* runTelefunc owns feedback */ } }
function requestDelete(item: Provider) { providerToDelete.value = item; deleteDialogOpen.value = true; }
async function removeProvider() { const item = providerToDelete.value; if (!item) return; deleting.value = true; try { await runTelefunc(() => onDeleteEmailProvider(item.id), { successMessage: "邮件 Provider 已删除。" }); deleteDialogOpen.value = false; providerToDelete.value = null; await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { deleting.value = false; } }
function selectTestProvider(item: Provider) { testProviderId.value = item.id; document.getElementById("test-recipient")?.focus(); }
async function sendTestEmail() { if (!testProviderId.value) return; sendingTest.value = true; try { await runTelefunc(() => onSendTestEmail({ to: testForm.to, providerConfigId: testProviderId.value, customContent: testForm.customContent }), { successMessage: "测试邮件已发送。" }); } catch { /* runTelefunc owns feedback */ } finally { sendingTest.value = false; } }
onMounted(async () => { try { await loadDefinitions(); await loadProviders(); } catch (cause) { error.value = userErrorMessage(cause); } });
</script>
