<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions><Button size="sm" @click="startCreate">新增渠道</Button></template>
    </AdminPageHeader>

    <Card>
      <CardHeader><CardTitle>三方渠道</CardTitle><CardDescription>通过 JSON 配置 HTTP 推送接口。同一时间仅启用一个配置；Server酱可作为配置示例。</CardDescription></CardHeader>
      <CardContent>
        <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">正在加载...</div>
        <div v-else-if="!providers.length" class="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">暂无三方渠道，请点击“新增渠道”。</div>
        <div v-else class="grid gap-2">
          <div v-for="item in providers" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <div><div class="flex items-center gap-2"><span class="font-medium">{{ item.name }}</span><Badge :variant="item.isEnabled ? 'secondary' : 'outline'">{{ item.isEnabled ? '已启用' : '未启用' }}</Badge><Badge v-if="item.configurationError" variant="outline" class="border-destructive/40 text-destructive">配置无效</Badge></div><p class="mt-1 text-xs text-muted-foreground">通用 HTTP JSON</p></div>
            <div class="flex items-center gap-2"><Button size="sm" variant="outline" @click="editProvider(item)">编辑</Button><Button size="sm" variant="outline" :disabled="testing || item.configurationError" @click="testProvider(item)">测试</Button><Button size="sm" variant="destructive" :disabled="item.isEnabled" @click="removeProvider(item)">删除</Button><Switch :model-value="item.isEnabled" :disabled="changingId === item.id || item.configurationError" :aria-label="`${item.name}启用状态`" @update:model-value="toggleProvider(item, $event === true)" /></div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>三方接口配置说明</CardTitle><CardDescription>选择服务查看可直接使用的配置与字段说明；接入其他服务时，请按其接口文档填写对应字段。</CardDescription></CardHeader>
      <CardContent><Tabs default-value="server-chan"><TabsList><TabsTrigger value="server-chan">Server酱</TabsTrigger><TabsTrigger value="push-plus">PushPlus（推送加）</TabsTrigger></TabsList><TabsContent value="server-chan" class="grid gap-4"><pre class="max-h-80 overflow-auto rounded-md bg-muted p-4 text-xs">{{ example }}</pre><dl class="grid gap-3 text-sm text-muted-foreground"><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>endpoint</code></dt><dd>Server酱 Turbo API 地址；将“请替换为你的SENDKEY”替换为在 Server酱后台创建的 SendKey。</dd></div><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>headers</code></dt><dd>请求头。Server酱使用 <code>application/x-www-form-urlencoded</code> 表单编码。</dd></div><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>body</code></dt><dd>请求体。<code>title</code> 为标题，<code>desp</code> 为正文。</dd></div><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>success</code></dt><dd>成功响应为 <code>{"code": 0}</code>，因此使用 <code>field: "code"</code> 与 <code>value: 0</code>。</dd></div><div v-pre class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground">模板变量</dt><dd><code>{{title}}</code> 会替换为消息标题，<code>{{content}}</code> 会替换为消息正文。</dd></div></dl></TabsContent><TabsContent value="push-plus" class="grid gap-4"><pre class="max-h-80 overflow-auto rounded-md bg-muted p-4 text-xs">{{ pushPlusExample }}</pre><dl class="grid gap-3 text-sm text-muted-foreground"><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>endpoint</code></dt><dd>PushPlus 消息接口地址 <code>https://www.pushplus.plus/send</code>。</dd></div><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>headers</code></dt><dd>PushPlus 接收 JSON 请求，因此使用 <code>application/json</code>。</dd></div><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>body.token</code></dt><dd>PushPlus 用户 Token 或消息 Token；将“请替换为你的PUSHPLUS_TOKEN”替换为你的 Token。</dd></div><div v-pre class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>body.title</code> / <code>body.content</code></dt><dd>分别使用 <code>{{title}}</code> 和 <code>{{content}}</code>，运行时替换为消息标题和正文；<code>template: "html"</code> 为 PushPlus HTML 模板。</dd></div><div class="flex flex-wrap gap-x-3 gap-y-1"><dt class="font-medium text-foreground"><code>success</code></dt><dd>PushPlus 接收请求成功时返回 <code>{"code": 200}</code>，因此使用 <code>field: "code"</code> 与 <code>value: 200</code>。</dd></div></dl></TabsContent><p class="mt-4 text-sm text-muted-foreground"><code>schemaVersion</code> 必须为 <code>1</code>，<code>method</code> 当前仅支持 <code>POST</code>；<code>timeoutMs</code> 可省略，默认 <code>10000</code> 毫秒。</p></Tabs></CardContent>
    </Card>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b px-6 py-5 pr-14"><DialogTitle>{{ editingId ? '编辑三方渠道' : '新增三方渠道' }}</DialogTitle><DialogDescription>填写渠道名称和完整 JSON 配置。可先载入 Server酱示例再修改 SendKey。</DialogDescription></DialogHeader>
        <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="submit">
          <div class="grid min-h-0 gap-5 overflow-y-auto px-6 py-5">
            <VeeField v-slot="{ componentField, errors }" name="name" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="third-party-name">渠道名称</FieldLabel><Input id="third-party-name" v-bind="componentField" placeholder="例如：Server酱" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            <VeeField v-slot="{ componentField, errors }" name="configJson" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><div class="flex items-center justify-between gap-3"><FieldLabel for="third-party-json">接口 JSON</FieldLabel><Button v-if="!editingId" type="button" size="sm" variant="outline" @click="setFieldValue('configJson', example)">载入 Server酱示例</Button></div><Textarea id="third-party-json" v-bind="componentField" rows="18" class="font-mono text-xs" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            <VeeField name="isEnabled"><Field orientation="horizontal"><FieldLabel for="third-party-enabled">保存后启用</FieldLabel><Switch id="third-party-enabled" v-model="isEnabled" /></Field></VeeField>
          </div>
          <DialogFooter class="border-t px-6 py-4"><Button type="button" variant="outline" :disabled="saving" @click="dialogOpen = false">取消</Button><Button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存配置' }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { Field as VeeField, useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { runTelefunc } from "@/lib/telefunc-client";
import { onDeleteThirdPartyProvider, onGetThirdPartyProviders, onSaveThirdPartyProvider, onSetThirdPartyProviderEnabled, onTestThirdPartyProvider } from "@/server/push/wechat-admin.telefunc";

type Result = Awaited<ReturnType<typeof onGetThirdPartyProviders>>;
type Provider = Result["providers"][number];
const schema = toTypedSchema(z.object({ name: z.string().trim().min(1, "请填写渠道名称。").max(120, "渠道名称不能超过 120 个字符。"), configJson: z.string().trim().min(1, "请填写接口 JSON。").max(20_000, "接口 JSON 不能超过 20,000 个字符。") }));
const { handleSubmit, resetForm, setFieldValue } = useForm({ validationSchema: schema, initialValues: { name: "", configJson: "" } });
const providers = ref<Provider[]>([]); const example = ref(""); const pushPlusExample = JSON.stringify({
  schemaVersion: 1,
  endpoint: "https://www.pushplus.plus/send",
  method: "POST",
  headers: { "content-type": "application/json" },
  body: { token: "请替换为你的PUSHPLUS_TOKEN", title: "{{title}}", content: "{{content}}", template: "html" },
  success: { field: "code", value: 200 },
  timeoutMs: 10_000,
}, null, 2); const loading = ref(false); const saving = ref(false); const testing = ref(false); const changingId = ref<number | null>(null); const dialogOpen = ref(false); const editingId = ref<number>(); const isEnabled = ref(false);
async function loadProviders() { loading.value = true; try { const result = await runTelefunc(() => onGetThirdPartyProviders()); providers.value = result.providers; example.value = result.example; } finally { loading.value = false; } }
function startCreate() { editingId.value = undefined; isEnabled.value = false; resetForm({ values: { name: "Server酱", configJson: example.value } }); dialogOpen.value = true; }
function editProvider(item: Provider) { editingId.value = item.id; isEnabled.value = item.isEnabled; resetForm({ values: { name: item.name, configJson: item.configJson } }); dialogOpen.value = true; }
const submit = handleSubmit(async (values) => { saving.value = true; try { await runTelefunc(() => onSaveThirdPartyProvider({ id: editingId.value, name: values.name, configJson: values.configJson, isEnabled: isEnabled.value }), { successMessage: "三方渠道已保存。" }); dialogOpen.value = false; await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } });
async function toggleProvider(item: Provider, enabled: boolean) { changingId.value = item.id; try { await runTelefunc(() => onSetThirdPartyProviderEnabled(item.id, enabled), { successMessage: enabled ? "三方渠道已启用。" : "三方渠道已停用。" }); await loadProviders(); } catch { /* runTelefunc owns feedback */ } finally { changingId.value = null; } }
async function testProvider(item: Provider) { testing.value = true; try { await runTelefunc(() => onTestThirdPartyProvider(item.id), { successMessage: "测试消息已发送。" }); } catch { /* runTelefunc owns feedback */ } finally { testing.value = false; } }
async function removeProvider(item: Provider) { try { await runTelefunc(() => onDeleteThirdPartyProvider(item.id), { successMessage: "三方渠道已删除。" }); await loadProviders(); } catch { /* runTelefunc owns feedback */ } }
onMounted(loadProviders);
</script>
