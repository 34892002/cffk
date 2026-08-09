<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Alert v-if="loadError" variant="destructive">
      <AlertTitle>安全配置加载失败</AlertTitle>
      <AlertDescription class="flex flex-wrap items-center gap-3">
        <span>{{ loadError }}</span>
        <Button size="sm" variant="outline" :disabled="statusLoading" @click="loadStatus({ initial: true })">重试</Button>
      </AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <CardTitle>双重认证</CardTitle>
        <CardDescription>启用后，管理员使用用户名和密码登录时还必须提供验证器 App 的验证码。</CardDescription>
      </CardHeader>
      <CardContent v-if="status" class="grid gap-6">
        <Alert :class="status.twoFactorEnabled ? undefined : 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'">
          <ShieldCheckIcon v-if="status.twoFactorEnabled" class="size-4" />
          <ShieldAlertIcon v-else class="size-4" />
          <AlertTitle>{{ status.twoFactorEnabled ? "双重认证已启用" : "双重认证未启用" }}</AlertTitle>
          <AlertDescription :class="status.twoFactorEnabled ? undefined : 'text-orange-600 dark:text-orange-400'">{{ status.twoFactorEnabled ? `账号 ${status.username} 受验证器 App 保护。` : "建议在生产环境中启用，并妥善保存恢复代码。" }}</AlertDescription>
        </Alert>

        <template v-if="!status.twoFactorEnabled">
          <div v-if="!setup" class="grid max-w-md gap-3">
            <div class="grid gap-2"><Label for="setup-password">当前密码</Label><Input id="setup-password" v-model="currentPassword" type="password" autocomplete="current-password" /></div>
            <Button class="w-fit" :disabled="loading || !currentPassword" @click="createSetup">{{ loading ? "生成中..." : "开始绑定验证器" }}</Button>
          </div>
          <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div class="grid gap-4">
              <div class="grid gap-2"><Label>手动密钥</Label><Input :model-value="setup.secret" readonly class="font-mono" /></div>
              <div class="grid gap-2"><Label for="totp-code">验证器验证码</Label><Input id="totp-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="请输入 6 位验证码" /></div>
              <div class="flex gap-3"><Button :disabled="loading || code.length !== 6" @click="verifySetup">{{ loading ? "验证中..." : "确认启用" }}</Button><Button variant="outline" :disabled="loading" @click="clearSetup">取消</Button></div>
              <Alert v-if="backupCodes.length">
                <AlertTitle>请保存恢复代码</AlertTitle>
                <AlertDescription>
                  <p>每个代码仅可使用一次。关闭此页面后将无法再次查看当前这组代码。</p>
                  <div class="mt-3 grid w-full max-w-md grid-cols-1 gap-2 rounded-md bg-muted p-3 font-mono text-sm text-foreground sm:grid-cols-2">
                    <code v-for="backupCode in backupCodes" :key="backupCode" class="rounded bg-background px-3 py-2">{{ backupCode }}</code>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
            <div class="grid aspect-square place-items-center self-start rounded-lg border bg-white p-4"><img :src="setup.qrCode" alt="双重认证二维码" class="aspect-square w-full max-w-56 object-contain" /></div>
          </div>
        </template>

        <div v-else class="grid gap-4">
          <div class="grid max-w-md gap-2">
            <Label for="current-password">当前密码</Label>
            <Input id="current-password" v-model="currentPassword" type="password" autocomplete="current-password" />
          </div>
          <Button variant="destructive" class="w-fit" :disabled="loading || !currentPassword" @click="disableTwoFactor">{{ loading ? "关闭中..." : "关闭双重认证" }}</Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Cloudflare Turnstile</CardTitle><CardDescription>为后台用户名密码登录增加人机验证，降低自动化撞库与爆破风险。</CardDescription></CardHeader>
      <CardContent v-if="status" class="grid gap-4">
        <Alert :class="status.turnstile.enabled ? undefined : 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'"><ShieldCheckIcon v-if="status.turnstile.enabled" class="size-4" /><ShieldAlertIcon v-else class="size-4" /><AlertTitle>{{ status.turnstile.enabled ? "Turnstile 已启用" : "Turnstile 未完整配置" }}</AlertTitle><AlertDescription :class="status.turnstile.enabled ? undefined : 'text-orange-600 dark:text-orange-400'">{{ status.turnstile.enabled ? "后台登录会强制校验 Turnstile 令牌。" : "须同时配置站点 Key 和 Secret Key 才会启用。" }}</AlertDescription></Alert>
        <div class="rounded-md border bg-muted/30 p-4 text-sm leading-6">
          <p>在 Cloudflare Dashboard 创建 Turnstile 站点后，将以下变量配置到 Worker：</p>
          <pre class="mt-3 overflow-x-auto rounded bg-background p-3 font-mono text-xs">TURNSTILE_SITE_KEY=前端站点 Key
TURNSTILE_SECRET_KEY=服务端 Secret Key</pre>
          <p class="mt-3 text-muted-foreground">Secret Key 只存放在 Worker Secret 中，页面不会返回其原文。</p>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import QRCode from "qrcode";
import { toast } from "vue-sonner";
import { ShieldAlertIcon, ShieldCheckIcon } from "@lucide/vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetSecurityStatus } from "@/server/security/admin.telefunc";

const status = ref<Awaited<ReturnType<typeof onGetSecurityStatus>> | null>(null);
const setup = ref<{ secret: string; qrCode: string } | null>(null);
const backupCodes = ref<string[]>([]);
const code = ref("");
const currentPassword = ref("");
const loading = ref(false);
const statusLoading = ref(false);
const loadError = ref<string | null>(null);

async function loadStatus({ initial = false } = {}) {
  statusLoading.value = true;
  try {
    status.value = await runTelefunc(() => onGetSecurityStatus(), { notifyError: !initial });
    loadError.value = null;
    return true;
  } catch (cause) {
    if (initial) loadError.value = userErrorMessage(cause);
    return false;
  } finally {
    statusLoading.value = false;
  }
}

function clearSetup() {
  setup.value = null;
  backupCodes.value = [];
  code.value = "";
}

function authErrorMessage(cause: unknown) {
  return userErrorMessage(cause, "双重认证操作失败，请检查当前密码和验证码后重试。");
}

async function createSetup() {
  loading.value = true;
  try {
    const result = await authClient.twoFactor.enable({ password: currentPassword.value || undefined });
    if (result.error || !result.data) {
      toast.error("双重认证绑定失败，请检查当前密码后重试。");
      return;
    }
    const secret = new URL(result.data.totpURI).searchParams.get("secret");
    if (!secret) {
      toast.error("双重认证绑定失败，请稍后重试。");
      return;
    }
    setup.value = {
      secret,
      qrCode: await QRCode.toDataURL(result.data.totpURI, { margin: 1, width: 256 }),
    };
    backupCodes.value = result.data.backupCodes;
  } catch (cause) {
    toast.error(authErrorMessage(cause));
  } finally {
    loading.value = false;
  }
}

async function verifySetup() {
  loading.value = true;
  try {
    const result = await authClient.twoFactor.verifyTotp({ code: code.value, trustDevice: false });
    if (result.error) {
      toast.error("验证码无效，请检查验证器 App 后重试。");
      return;
    }
    if (!await loadStatus()) return;
    currentPassword.value = "";
    code.value = "";
    toast.success("双重认证已启用。");
  } catch (cause) {
    toast.error(authErrorMessage(cause));
  } finally {
    loading.value = false;
  }
}

async function disableTwoFactor() {
  loading.value = true;
  try {
    const result = await authClient.twoFactor.disable({ password: currentPassword.value });
    if (result.error) {
      toast.error("关闭双重认证失败，请检查当前密码后重试。");
      return;
    }
    if (!await loadStatus()) return;
    currentPassword.value = "";
    toast.success("双重认证已关闭。");
  } catch (cause) {
    toast.error(authErrorMessage(cause));
  } finally {
    loading.value = false;
  }
}

onMounted(() => { void loadStatus({ initial: true }); });
</script>
