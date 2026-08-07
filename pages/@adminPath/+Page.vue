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
import { ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const username = ref("");
const password = ref("");
const error = ref(pageContext.urlParsed.search.error === "ADMIN_ACCESS_REQUIRED"
  ? "该账号已登录，但没有后台管理员权限。"
  : null);
const submitting = ref(false);

async function onSubmit() {
  error.value = null;
  submitting.value = true;
  try {
    const res = await authClient.signIn.username({ username: username.value, password: password.value });
    if (res.error) {
      error.value = res.error.message ?? "用户名或密码不正确。";
      return;
    }

    // The server guard verifies adminProfile before rendering the dashboard.
    await navigate(`/${pageContext.routeParams.adminPath}/dash`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "登录请求未能完成，请检查服务是否正常运行。";
  } finally {
    submitting.value = false;
  }
}
</script>
