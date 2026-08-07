<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 pb-6">
        <CardTitle>注册账号</CardTitle>
        <CardDescription>填写管理员账号信息。</CardDescription>
      </CardHeader>
      <form class="grid gap-6" @submit.prevent="onSubmit">
        <CardContent class="grid gap-5">
          <div class="grid gap-2">
            <Label for="username">用户名</Label>
            <Input id="username" v-model="username" autocomplete="username" placeholder="3 至 30 位字母、数字、下划线或点" minlength="3" maxlength="30" required />
          </div>
          <div class="grid gap-2">
            <Label for="name">昵称</Label>
            <Input id="name" v-model="name" autocomplete="name" placeholder="请输入昵称" required />
          </div>
          <div class="grid gap-2">
            <Label for="email">邮箱</Label>
            <Input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
          </div>
          <div class="grid gap-2">
            <Label for="password">密码</Label>
            <Input id="password" v-model="password" type="password" autocomplete="new-password" placeholder="至少 8 位字符" minlength="8" required />
          </div>
          <Alert v-if="error" variant="destructive" role="alert">
            <AlertTitle>注册失败</AlertTitle>
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button class="w-full" type="submit" :disabled="submitting">{{ submitting ? "注册中..." : "注册" }}</Button>
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

const username = ref("");
const name = ref("");
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const submitting = ref(false);

const onSubmit = async () => {
  error.value = null;
  submitting.value = true;
  try {
    const res = await authClient.signUp.email({
      username: username.value,
      name: name.value,
      email: email.value,
      password: password.value,
    });
    if (res.error) {
      error.value = "注册未能完成，请检查填写的信息。";
      return;
    }
    await navigate("/");
  } catch {
    error.value = "注册请求未能完成，请稍后重试。";
  } finally {
    submitting.value = false;
  }
};
</script>
