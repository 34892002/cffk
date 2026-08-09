<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 pb-6">
        <CardTitle>后台登录</CardTitle>
        <CardDescription>使用管理员用户名和密码登录。</CardDescription>
      </CardHeader>
      <form class="grid gap-6" @submit.prevent="onSubmit">
        <CardContent class="grid gap-5">
          <div class="grid gap-2">
            <Label for="username">用户名</Label>
            <Input id="username" v-model="username" type="text" autocomplete="username" placeholder="请输入用户名" minlength="3" maxlength="30" required />
          </div>
          <div class="grid gap-2">
            <Label for="password">密码</Label>
            <Input id="password" v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" required />
          </div>
          <div v-if="turnstileSiteKey" ref="turnstileElement" class="min-h-16" />
          <Alert v-if="error" variant="destructive" role="alert">
            <AlertTitle>无法登录后台</AlertTitle>
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button class="w-full" type="submit" :disabled="submitting">{{ submitting ? "登录中..." : "登录" }}</Button>
        </CardFooter>
      </form>
    </Card>
  </main>
</template>

<script lang="ts" setup>
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { navigate } from "vike/client/router";
import { nextTick, onMounted, ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const username = ref("");
const password = ref("");
const error = ref(pageContext.urlParsed.search.error === "ADMIN_ACCESS_REQUIRED"
  ? "该账号已登录，但没有后台管理员权限。"
  : null);
const submitting = ref(false);
const turnstileElement = ref<HTMLElement | null>(null);
const turnstileSiteKey = ref<string | null>(null);
const turnstileToken = ref("");

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => void; }; } }

async function loadTurnstile() {
  const config = await fetch("/api/security/turnstile").then((response) => response.json() as Promise<{ enabled: boolean; siteKey: string | null }>);
  if (!config.enabled || !config.siteKey) return;
  turnstileSiteKey.value = config.siteKey;
  await nextTick();
  await new Promise<void>((resolve, reject) => {
    if (window.turnstile) { resolve(); return; }
    const script = window.document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("TURNSTILE_LOAD_FAILED")); window.document.head.appendChild(script);
  });
  if (turnstileElement.value) window.turnstile?.render(turnstileElement.value, { sitekey: config.siteKey, callback: (token) => { turnstileToken.value = token; }, "expired-callback": () => { turnstileToken.value = ""; } });
}

async function onSubmit() {
  error.value = null;
  submitting.value = true;
  try {
    if (turnstileSiteKey.value && !turnstileToken.value) { error.value = "请先完成人机验证。"; return; }
    const res = await authClient.signIn.username({ username: username.value, password: password.value, ...(turnstileToken.value ? { fetchOptions: { headers: { "x-captcha-response": turnstileToken.value } } } : {}) });
    if (res.error) {
      error.value = "用户名或密码不正确。";
      return;
    }

    // The server guard verifies the singleton root before rendering the dashboard.
    await navigate(`/${pageContext.routeParams.adminPath}/dash`);
  } catch {
    error.value = "登录请求未能完成，请稍后重试。";
  } finally {
    submitting.value = false;
  }
}
onMounted(() => { void loadTurnstile().catch(() => { error.value = "人机验证加载失败，请刷新页面后重试。"; }); });
</script>
