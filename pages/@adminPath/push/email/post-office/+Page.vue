<template>
  <MailSettingsLayout>
    <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 class="text-xl font-semibold tracking-normal">通道配置</h2><p class="mt-1 text-sm text-muted-foreground">邮局配置保存为 JSON，密钥仅可引用 Worker Secret。</p></div><Button :disabled="loading" @click="loadProviders">刷新数据</Button></div>
    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
    <Card v-for="item in providers" :key="item.provider"><CardHeader><div class="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{{ item.name }}</CardTitle><CardDescription class="mt-1 font-mono">{{ item.provider }}</CardDescription></div><Badge :variant="item.isEnabled ? 'secondary' : 'outline'">{{ item.isEnabled ? '已启用' : '未启用' }}</Badge></div></CardHeader><form @submit.prevent="saveProvider(item.provider)"><CardContent class="grid max-w-3xl gap-4"><label class="grid gap-2 text-sm font-medium">显示名称<Input v-model="forms[item.provider].name" required /></label><label class="flex items-center gap-2 text-sm font-medium"><Checkbox v-model="forms[item.provider].isEnabled" class="size-4" /> 启用此 Provider</label><label class="grid gap-2 text-sm font-medium">配置 JSON<Textarea v-model="forms[item.provider].configJson" rows="10" spellcheck="false" class="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><p class="text-xs leading-5 text-muted-foreground">Cloudflare Email Sending 示例：`{ "kind": "cloudflare", "binding": "EMAIL", "from": "orders@example.com" }`。binding 必须与 `wrangler.jsonc` 的 Email binding 名称一致。</p></CardContent><CardFooter><Button type="submit" :disabled="saving === item.provider">{{ saving === item.provider ? '保存中...' : '保存配置' }}</Button></CardFooter></form></Card>
    <Card v-if="!loading && !providers.length"><CardContent class="py-10 text-center text-sm text-muted-foreground">尚未初始化邮件 Provider。请先执行数据库 seed。</CardContent></Card>

    <Card>
      <CardHeader><CardTitle>发送测试邮件</CardTitle><CardDescription>使用当前启用的 Provider 和 `TEST` 模板发送；发送失败同样会写入历史记录。</CardDescription></CardHeader>
      <form @submit.prevent="sendTestEmail">
        <CardContent class="grid max-w-3xl gap-4"><label class="grid gap-2 text-sm font-medium">收件人邮箱<Input v-model="testForm.to" type="email" autocomplete="email" required /></label><label class="grid gap-2 text-sm font-medium">测试内容（可选）<Textarea v-model="testForm.customContent" rows="4" class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label></CardContent>
        <CardFooter class="flex flex-wrap items-center gap-3"><Button type="submit" :disabled="sendingTest">{{ sendingTest ? '发送中...' : '发送测试邮件' }}</Button><span v-if="testResult" class="text-sm" :class="testResult.kind === 'success' ? 'text-emerald-600' : 'text-destructive'">{{ testResult.message }}</span></CardFooter>
      </form>
    </Card>
  </MailSettingsLayout>
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
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
import { onGetEmailProviders, onSaveEmailProvider, onSendTestEmail } from "@/server/email/admin.telefunc";

type Provider = Awaited<ReturnType<typeof onGetEmailProviders>>[number];
type Form = { name: string; isEnabled: boolean; configJson: string };
const providers = ref<Provider[]>([]);
const forms = reactive<Record<string, Form>>({});
const loading = ref(false);
const saving = ref<string | null>(null);
const error = ref<string | null>(null);
const testForm = reactive({ to: "", customContent: "" });
const sendingTest = ref(false);
const testResult = ref<{ kind: "success" | "error"; message: string } | null>(null);
async function loadProviders() { loading.value = true; error.value = null; try { providers.value = await onGetEmailProviders(); for (const item of providers.value) forms[item.provider] = { name: item.name, isEnabled: item.isEnabled, configJson: item.configJson }; } catch (cause) { error.value = errorMessage(cause); } finally { loading.value = false; } }
async function saveProvider(provider: Provider["provider"]) { const form = forms[provider]; if (!form) return; saving.value = provider; error.value = null; try { await onSaveEmailProvider({ provider, ...form }); await loadProviders(); } catch (cause) { error.value = errorMessage(cause); } finally { saving.value = null; } }
async function sendTestEmail() { sendingTest.value = true; testResult.value = null; try { const result = await onSendTestEmail({ to: testForm.to, customContent: testForm.customContent }); testResult.value = { kind: "success", message: `已发送，消息 ID：${result.messageId}` }; } catch (cause) { testResult.value = { kind: "error", message: testErrorMessage(cause) }; } finally { sendingTest.value = false; } }
function errorMessage(cause: unknown) { const code = cause instanceof Error ? cause.message : ""; return { ADMIN_ACCESS_REQUIRED: "管理员身份已失效，请重新登录。", EMAIL_PROVIDER_NAME_REQUIRED: "请填写 Provider 名称。", EMAIL_PROVIDER_KIND_MISMATCH: "JSON 的 kind 必须与当前 Provider 一致。", EMAIL_PROVIDER_NOT_FOUND: "Provider 不存在。" }[code] ?? "邮件 Provider JSON 无效，请检查字段和 Secret 引用。"; }
function testErrorMessage(cause: unknown) { const code = cause instanceof Error ? cause.message : ""; return { ADMIN_ACCESS_REQUIRED: "管理员身份已失效，请重新登录。", EMAIL_RECIPIENT_INVALID: "请输入有效的收件人邮箱。", EMAIL_PROVIDER_NOT_AVAILABLE: "请先启用一个邮件 Provider。", EMAIL_TEMPLATE_NOT_AVAILABLE: "请先启用 TEST 邮件模板。", EMAIL_CLOUDFLARE_BINDING_UNAVAILABLE: "未找到 Cloudflare Email Sending binding，请检查 Worker 配置。", EMAIL_PROVIDER_NOT_IMPLEMENTED: "当前 Provider 尚未实现发送能力。" }[code] ?? "测试邮件发送失败，具体原因已写入邮件历史。"; }
onMounted(loadProviders);
</script>
