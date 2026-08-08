<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 pb-6">
        <CardTitle>注册管理员账号</CardTitle>
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
            <div class="relative">
              <Input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="至少 8 位字符" minlength="8" class="pr-10" required />
              <button
                class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                type="button"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                :title="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="confirm-password">确认密码</Label>
            <div class="relative">
              <Input id="confirm-password" v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="再次输入密码" minlength="8" class="pr-10" required />
              <button
                class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                type="button"
                :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'"
                :title="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <EyeOff v-if="showConfirmPassword" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
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
import { Eye, EyeOff } from "@lucide/vue";
import { ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { navigate } from "vike/client/router";

const username = ref("");
const name = ref("root");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const error = ref<string | null>(null);
const submitting = ref(false);

const onSubmit = async () => {
  error.value = null;
  if (password.value !== confirmPassword.value) {
    error.value = "两次输入的密码不一致。";
    return;
  }

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
