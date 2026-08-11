<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions><Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadConfig"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button></template>
    </AdminPageHeader>

    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Card>
      <CardHeader><CardTitle>全局状态</CardTitle><CardDescription>关闭后不会创建新的业务消息投递任务；测试邮件不受此开关影响。</CardDescription></CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-3">
        <label class="flex items-center justify-between gap-3 rounded-md border p-3 text-sm font-medium"><span>启用消息推送</span><Switch v-model="form.isEnabled" /></label>
        <div class="rounded-md border p-3 text-sm"><p class="text-muted-foreground">电子邮件</p><p class="mt-1 font-medium">{{ channels.EMAIL.available ? "已配置" : "不可用" }}</p><p v-if="channels.EMAIL.reason" class="mt-1 text-xs text-muted-foreground">{{ channels.EMAIL.reason }}</p></div>
        <div class="rounded-md border p-3 text-sm"><p class="text-muted-foreground">管理员渠道</p><p class="mt-1 font-medium">微信、Telegram</p><p class="mt-1 text-xs text-muted-foreground">Provider 接入后可在策略中启用。</p></div>
      </CardContent>
    </Card>

    <Card v-for="group in groups" :key="group.messageType">
      <CardHeader><CardTitle>{{ group.title }}</CardTitle><CardDescription>{{ group.description }}</CardDescription></CardHeader>
      <CardContent class="overflow-x-auto">
        <table class="w-full min-w-175 text-sm">
          <thead class="border-b text-left text-muted-foreground"><tr><th class="w-32 px-3 py-2 font-medium">场景</th><th class="min-w-52 px-3 py-2 font-medium">说明</th><th class="w-28 px-3 py-2 font-medium">启用策略</th><th class="w-36 px-3 py-2 font-medium">电子邮件</th><th class="w-36 px-3 py-2 font-medium">微信</th><th class="w-36 px-3 py-2 font-medium">Telegram</th></tr></thead>
          <tbody><tr v-for="scene in scenes" :key="scene.value" class="border-b last:border-0"><td class="px-3 py-3 font-medium">{{ scene.label }}</td><td class="px-3 py-3 text-muted-foreground">{{ scene.description }}</td><td class="px-3 py-3"><Switch v-model="policy(group.messageType, scene.value).isEnabled" :aria-label="`启用${group.title}${scene.label}策略`" /></td><td class="px-3 py-3"><label class="flex items-center gap-2" :class="!channels.EMAIL.available ? 'text-muted-foreground' : ''"><Checkbox :model-value="hasChannel(policy(group.messageType, scene.value), 'EMAIL')" :disabled="!channels.EMAIL.available || !hasTemplate(scene.value) || !policy(group.messageType, scene.value).isEnabled" @update:model-value="setChannel(policy(group.messageType, scene.value), 'EMAIL', $event)" /><span>邮件</span></label><p v-if="!hasTemplate(scene.value)" class="mt-1 text-xs text-orange-600 dark:text-orange-400">模板未启用</p></td><td class="px-3 py-3"><Badge variant="outline">{{ group.messageType === 'NORMAL' ? '仅管理员' : '未接入' }}</Badge></td><td class="px-3 py-3"><Badge variant="outline">{{ group.messageType === 'NORMAL' ? '仅管理员' : '未接入' }}</Badge></td></tr></tbody>
        </table>
      </CardContent>
      <CardFooter v-if="group.messageType === 'ADMIN'" class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-muted-foreground">管理员邮件固定发送给唯一 Root 管理员邮箱。</p><Button :disabled="saving || loading" @click="saveConfig">{{ saving ? "保存中..." : "保存推送策略" }}</Button></CardFooter>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetPushConfig, onSavePushConfig, type PushChannel, type PushMessageType, type PushScene } from "@/server/push/admin.telefunc";

type Config = Awaited<ReturnType<typeof onGetPushConfig>>;
type Policy = Config["policies"][number];
const scenes: Array<{ value: PushScene; label: string; description: string }> = [{ value: "ORDER_PAID", label: "支付成功", description: "订单完成支付后发送通知。" }, { value: "DELIVERY_SUCCESS", label: "发货成功", description: "订单完成发货后发送通知。" }, { value: "DELIVERY_FAILED", label: "发货失败", description: "订单发货异常时发送通知。" }];
const groups = [{ messageType: "NORMAL" as const, title: "普通消息", description: "发送给订单客户。客户消息只能投递到订单快照中的有效邮箱。" }, { messageType: "ADMIN" as const, title: "管理消息", description: "发送给唯一 Root 管理员。管理员专属渠道不会向客户联系方式投递。" }];
const initialPolicies: Policy[] = [
  { messageType: "NORMAL", scene: "ORDER_PAID", channels: ["EMAIL"], isEnabled: true }, { messageType: "NORMAL", scene: "DELIVERY_SUCCESS", channels: ["EMAIL"], isEnabled: true }, { messageType: "NORMAL", scene: "DELIVERY_FAILED", channels: [], isEnabled: true },
  { messageType: "ADMIN", scene: "ORDER_PAID", channels: [], isEnabled: true }, { messageType: "ADMIN", scene: "DELIVERY_SUCCESS", channels: ["EMAIL"], isEnabled: true }, { messageType: "ADMIN", scene: "DELIVERY_FAILED", channels: ["EMAIL"], isEnabled: true },
];
const form = reactive<{ isEnabled: boolean; policies: Policy[] }>({ isEnabled: true, policies: initialPolicies });
const channels = ref<Config["channels"]>({ EMAIL: { available: false, reason: "", templateScenes: [] }, WECHAT: { available: false, reason: "", templateScenes: [] }, TELEGRAM: { available: false, reason: "", templateScenes: [] } });
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const templates = computed(() => new Set(channels.value.EMAIL.templateScenes));
function policy(messageType: PushMessageType, scene: PushScene) { const value = form.policies.find((item) => item.messageType === messageType && item.scene === scene); if (!value) throw new Error("PUSH_POLICY_INVALID"); return value; }
function hasChannel(item: Policy, channel: PushChannel) { return item.channels.includes(channel); }
function setChannel(item: Policy, channel: PushChannel, checked: boolean | "indeterminate") { item.channels = checked === true ? [...new Set([...item.channels, channel])] : item.channels.filter((value) => value !== channel); }
function hasTemplate(scene: PushScene) { return templates.value.has(scene); }
function assignConfig(value: Config) { form.isEnabled = value.isEnabled; form.policies = value.policies.map((item) => ({ ...item, channels: [...item.channels] })); channels.value = value.channels; }
async function loadConfig() { loading.value = true; error.value = null; try { assignConfig(await runTelefunc(() => onGetPushConfig(), { notifyError: false })); } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; } }
async function saveConfig() { saving.value = true; error.value = null; try { assignConfig(await runTelefunc(() => onSavePushConfig({ isEnabled: form.isEnabled, policies: form.policies.map((item) => ({ ...item, channels: [...item.channels] })) }), { successMessage: "推送策略已保存。" })); } catch { /* runTelefunc has shown the sanitized error message. */ } finally { saving.value = false; } }
onMounted(loadConfig);
</script>
