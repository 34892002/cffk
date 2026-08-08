<template>
  <MailSettingsLayout>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold tracking-normal">邮件模板</h2>
        <p class="mt-1 text-sm text-muted-foreground">订单事件会使用对应场景的模板发送邮件。编辑前可先查看触发时机和可用变量。</p>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadTemplates"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
    </div>

    <Alert v-if="error" variant="destructive">
      <AlertTitle>无法加载邮件模板</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <div v-else-if="templates.length" class="grid gap-4 lg:grid-cols-2">
      <Card v-for="item in templates" :key="item.scene">
        <CardHeader>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0"><CardTitle>{{ item.name }}</CardTitle><CardDescription class="mt-1">{{ item.description }}</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent class="grid gap-3">
          <div class="rounded-md border bg-muted/30 p-3"><p class="text-xs text-muted-foreground">邮件主题</p><p class="mt-1 truncate font-medium">{{ item.subject || '模板内容无效，请重新编辑。' }}</p></div>
          <div class="flex flex-wrap gap-2"><Badge v-for="variable in item.variables" :key="variable.key" variant="outline" class="font-mono">{{ variableToken(variable.key) }}</Badge></div>
        </CardContent>
        <CardFooter class="justify-between gap-3"><span class="font-mono text-xs text-muted-foreground">{{ item.scene }}</span><Button size="sm" @click="openEditor(item)">编辑模板</Button></CardFooter>
      </Card>
    </div>

    <Card v-else-if="!loading"><CardContent class="py-10 text-center text-sm text-muted-foreground">尚未初始化邮件模板。请先执行数据库 seed。</CardContent></Card>

    <Dialog v-model:open="editorOpen">
      <DialogContent class="flex h-[min(48rem,calc(100dvh-0.5rem))] w-[min(calc(100vw-2rem),64rem)] min-w-0 sm:max-w-none flex-col overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b p-6 pr-14">
          <DialogTitle>{{ currentTemplate?.name }}</DialogTitle><DialogDescription>{{ currentTemplate?.description }}</DialogDescription>
        </DialogHeader>
        <form v-if="currentTemplate" class="flex min-h-0 min-w-0 flex-1 flex-col" novalidate @submit.prevent="saveTemplate">
          <div class="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,0.9fr)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1">
            <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-6 py-5">
              <FieldGroup class="shrink-0">
                <VeeField v-slot="{ componentField, errors: fieldErrors }" name="name" :validate-on-input="true"><Field :data-invalid="fieldErrors.length > 0"><FieldLabel for="template-name">显示名称</FieldLabel><Input id="template-name" v-bind="componentField" autocomplete="off" :aria-invalid="fieldErrors.length > 0" /><FieldError v-if="fieldErrors.length" :errors="fieldErrors" /></Field></VeeField>
              </FieldGroup>
              <FieldSet class="mt-5 flex min-h-0 flex-1 flex-col">
                <FieldLegend class="shrink-0">邮件内容</FieldLegend>
                <FieldGroup class="flex min-h-0 flex-1 flex-col">
                  <VeeField v-slot="{ componentField, errors: fieldErrors }" name="subject" :validate-on-input="true"><Field :data-invalid="fieldErrors.length > 0"><FieldLabel for="template-subject">主题</FieldLabel><Input id="template-subject" v-bind="componentField" :aria-invalid="fieldErrors.length > 0" /><FieldError v-if="fieldErrors.length" :errors="fieldErrors" /></Field></VeeField>
                  <VeeField v-slot="{ componentField, errors: fieldErrors }" name="body" :validate-on-input="true"><Field class="min-h-0 flex-1" :data-invalid="fieldErrors.length > 0"><FieldLabel for="template-body">正文</FieldLabel><Textarea id="template-body" v-bind="componentField" rows="16" class="min-h-0 flex-1 resize-none" :aria-invalid="fieldErrors.length > 0" /><FieldDescription>点击右侧变量会插入正文末尾。使用 <code v-pre>{{variable}}</code> 引用变量。</FieldDescription><FieldError v-if="fieldErrors.length" :errors="fieldErrors" /></Field></VeeField>
                  <VeeField name="format"><Field orientation="horizontal"><div><FieldLabel for="template-format">使用 {{ values.format === 'html' ? 'HTML' : '文本' }} 邮件正文</FieldLabel><FieldDescription>{{ values.format === 'html' ? 'HTML 正文可使用标签定义文字格式与样式。' : '文本正文不解析 HTML 标签，会以纯文本显示。' }}</FieldDescription></div><Switch id="template-format" :model-value="values.format === 'html'" @update:model-value="setFieldValue('format', $event ? 'html' : 'text')" /></Field></VeeField>
                </FieldGroup>
              </FieldSet>
            </div>
            <aside class="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-t bg-muted/20 px-6 py-5 lg:border-l lg:border-t-0">
              <h3 class="text-sm font-semibold">可用变量</h3>
              <p class="mt-1 text-sm text-muted-foreground">仅可使用当前场景列出的变量。点击即可插入正文。</p>
              <div class="mt-4 grid min-w-0 gap-2"><Button v-for="variable in currentTemplate.variables" :key="variable.key" variant="outline" class="h-auto min-w-0 items-start justify-start whitespace-normal px-3 py-2 text-left" @click.prevent="appendVariable(variable.key)"><span class="grid min-w-0 gap-1"><span class="wrap-break-word font-mono text-xs">{{ variableToken(variable.key) }}</span><span class="text-xs font-normal text-foreground">{{ variable.label }}</span><span class="wrap-break-word text-xs font-normal text-muted-foreground">示例：{{ variable.example }}</span></span></Button></div>
              <div class="mt-6 min-w-0 border-t pt-5"><h3 class="text-sm font-semibold">预览</h3><div class="mt-3 grid min-w-0 gap-3 rounded-md border bg-background p-4"><div><p class="text-xs text-muted-foreground">主题</p><p class="mt-1 wrap-break-word font-medium">{{ previewSubject }}</p></div><div class="border-t pt-3"><p class="text-xs text-muted-foreground">正文</p><p class="mt-1 whitespace-pre-wrap wrap-break-word text-sm">{{ previewBody }}</p></div></div></div>
            </aside>
          </div>
          <DialogFooter class="shrink-0 border-t px-6 py-3"><Button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存模板' }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </MailSettingsLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import { toTypedSchema } from "@vee-validate/zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field as VeeField, useForm } from "vee-validate";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { Textarea } from "@/components/ui/textarea";
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetEmailTemplates, onSaveEmailTemplate } from "@/server/email/admin.telefunc";

type Template = Awaited<ReturnType<typeof onGetEmailTemplates>>[number];
type Form = { name: string; subject: string; body: string; format: "text" | "html" };
const formSchema = z.object({ name: z.string().trim().min(1, "请输入显示名称。"), subject: z.string().trim().min(1, "请输入邮件主题。"), body: z.string().trim().min(1, "请输入邮件正文。"), format: z.enum(["text", "html"]) });
const templates = ref<Template[]>([]);
const currentTemplate = ref<Template | null>(null);
const editorOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const { values, handleSubmit, resetForm, setFieldValue } = useForm<Form>({ validationSchema: toTypedSchema(formSchema) });
const examples = computed(() => Object.fromEntries(currentTemplate.value?.variables.map((variable) => [variable.key, variable.example]) ?? []));
const previewSubject = computed(() => renderPreview(values.subject ?? ""));
const previewBody = computed(() => renderPreview(values.body ?? ""));

function variableToken(key: string) { return `{{${key}}}`; }
function renderPreview(value: string) { return value.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, key: string) => examples.value[key] ?? variableToken(key)); }
function appendVariable(key: string) { setFieldValue("body", `${values.body?.replace(/\s+$/, "") ?? ""}${values.body?.trim() ? "\n" : ""}${variableToken(key)}`); }
function openEditor(item: Template) { currentTemplate.value = item; resetForm({ values: { name: item.name, subject: item.subject, body: item.body, format: item.format } }); editorOpen.value = true; }
async function loadTemplates() { loading.value = true; error.value = null; try { templates.value = await runTelefunc(() => onGetEmailTemplates(), { notifyError: false }); } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; } }
const saveTemplate = handleSubmit(async (form) => { const item = currentTemplate.value; if (!item) return; saving.value = true; try { await runTelefunc(() => onSaveEmailTemplate({ scene: item.scene, ...form }), { successMessage: "邮件模板已保存。" }); editorOpen.value = false; await loadTemplates(); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } });
onMounted(loadTemplates);
</script>
