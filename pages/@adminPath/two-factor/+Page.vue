<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <Card class="w-full max-w-md">
      <CardHeader><CardTitle>双重认证</CardTitle><CardDescription>请输入身份验证器 App 中显示的 6 位验证码以继续登录。</CardDescription></CardHeader>
      <form @submit.prevent="verify">
        <CardContent class="grid gap-5">
          <div class="grid gap-2"><Label for="totp-code">验证码</Label><Input id="totp-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位验证码" required /></div>
          <Alert v-if="error" variant="destructive"><AlertTitle>验证失败</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
        </CardContent>
        <CardFooter><Button class="w-full" type="submit" :disabled="loading || code.length !== 6">{{ loading ? "验证中..." : "继续登录" }}</Button></CardFooter>
      </form>
    </Card>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-vue/usePageContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const pageContext = usePageContext();
const code = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
async function verify() {
  loading.value = true; error.value = null;
  try {
    const result = await authClient.twoFactor.verifyTotp({ code: code.value, trustDevice: false });
    if (result.error) { error.value = "验证码无效或已过期。"; return; }
    await navigate(`/${pageContext.routeParams.adminPath}/dash`);
  } catch { error.value = "验证请求未能完成，请稍后重试。"; } finally { loading.value = false; }
}
</script>
