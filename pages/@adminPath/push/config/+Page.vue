<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions>
        <Button variant="outline" :disabled="loading" @click="loadConfig">刷新数据</Button>
      </template>
    </AdminPageHeader>

    <Alert v-if="error" variant="destructive"><AlertTitle>无法保存推送设置</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Card>
      <CardHeader><CardTitle>全局推送</CardTitle><CardDescription>关闭后不会触发新的通知；测试邮件不受此开关影响。</CardDescription></CardHeader>
      <CardContent><label class="flex items-center justify-between gap-3 text-sm font-medium"><span>启用消息推送</span><Switch v-model="form.isEnabled" /></label></CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>推送渠道</CardTitle><CardDescription>当前仅电子邮件已接入实际发送；企业微信和 Telegram 的渠道配置仍在开发中。</CardDescription></CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-3">
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>电子邮件</span><Switch v-model="form.emailEnabled" /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground"><span>企业微信（未接入）</span><Switch v-model="form.wecomEnabled" /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground"><span>Telegram（未接入）</span><Switch v-model="form.telegramEnabled" /></label>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>发送给客户</CardTitle><CardDescription>仅对具备有效联系方式的订单生效。</CardDescription></CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-3">
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>支付成功后发送</span><Switch v-model="form.customerOrderPaid" /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>发货成功后发送</span><Switch v-model="form.customerDeliverySuccess" /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>发货失败后发送</span><Switch v-model="form.customerDeliveryFailed" /></label>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>发送给管理员</CardTitle><CardDescription>管理员接收地址将在渠道配置接入后生效。</CardDescription></CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-3">
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>支付成功后发送</span><Switch v-model="form.adminOrderPaid" /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>发货成功后发送</span><Switch v-model="form.adminDeliverySuccess" /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>发货失败后发送</span><Switch v-model="form.adminDeliveryFailed" /></label>
      </CardContent>
      <CardFooter><Button :disabled="saving || loading" @click="saveConfig">{{ saving ? "保存中..." : "保存推送设置" }}</Button></CardFooter>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from "vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetPushConfig, onSavePushConfig } from "@/server/push/admin.telefunc";

type PushConfig = Awaited<ReturnType<typeof onGetPushConfig>>;
const form = reactive<Omit<PushConfig, "id" | "createdAt" | "updatedAt">>({
  isEnabled: true, emailEnabled: true, wecomEnabled: false, telegramEnabled: false,
  customerOrderPaid: true, customerDeliverySuccess: true, customerDeliveryFailed: false,
  adminOrderPaid: false, adminDeliverySuccess: true, adminDeliveryFailed: true,
});
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
function assignConfig(value: PushConfig) {
  Object.assign(form, {
    isEnabled: value.isEnabled, emailEnabled: value.emailEnabled, wecomEnabled: value.wecomEnabled, telegramEnabled: value.telegramEnabled,
    customerOrderPaid: value.customerOrderPaid, customerDeliverySuccess: value.customerDeliverySuccess, customerDeliveryFailed: value.customerDeliveryFailed,
    adminOrderPaid: value.adminOrderPaid, adminDeliverySuccess: value.adminDeliverySuccess, adminDeliveryFailed: value.adminDeliveryFailed,
  });
}
async function loadConfig() {
  loading.value = true;
  error.value = null;
  try { assignConfig(await runTelefunc(() => onGetPushConfig(), { notifyError: false })); } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; }
}
async function saveConfig() {
  saving.value = true;
  error.value = null;
  try { assignConfig(await runTelefunc(() => onSavePushConfig({ ...form }), { successMessage: "推送设置已保存。", notifyError: false })); } catch (cause) { error.value = userErrorMessage(cause); } finally { saving.value = false; }
}
onMounted(loadConfig);
</script>
