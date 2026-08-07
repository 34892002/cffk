<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <div class="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>基本资料</CardTitle>
          <CardDescription>修改当前管理员的昵称和登录邮箱。</CardDescription>
        </CardHeader>
        <form class="flex flex-col gap-4" @submit.prevent="saveProfile">
          <CardContent class="grid gap-5">
            <div class="grid gap-2">
              <Label for="name">昵称</Label>
              <Input id="name" v-model="profile.name" autocomplete="name" maxlength="100" required />
            </div>
            <div class="grid gap-2">
              <Label for="email">邮箱</Label>
              <Input id="email" v-model="profile.email" type="email" autocomplete="email" maxlength="320" required />
            </div>
          </CardContent>
          <CardFooter class="justify-end">
            <Button type="submit" :disabled="savingProfile">{{ savingProfile ? "保存中..." : "保存资料" }}</Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>修改密码前，请先验证当前密码。</CardDescription>
        </CardHeader>
        <form class="flex flex-col gap-4" @submit.prevent="changePassword">
          <CardContent class="grid gap-5">
            <div class="grid gap-2">
              <Label for="current-password">当前密码</Label>
              <Input id="current-password" v-model="password.current" type="password" autocomplete="current-password" required />
            </div>
            <div class="grid gap-2">
              <Label for="new-password">新密码</Label>
              <Input id="new-password" v-model="password.next" type="password" autocomplete="new-password" minlength="8" placeholder="至少 8 位字符" required />
            </div>
            <div class="grid gap-2">
              <Label for="confirm-password">确认新密码</Label>
              <Input id="confirm-password" v-model="password.confirm" type="password" autocomplete="new-password" minlength="8" required />
            </div>
          </CardContent>
          <CardFooter class="justify-end">
            <Button type="submit" :disabled="savingPassword">{{ savingPassword ? "修改中..." : "修改密码" }}</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  </section>
</template>

<script lang="ts" setup>
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "vue-sonner";
import { reactive, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();
const profile = reactive({ name: "", email: "" });
const password = reactive({ current: "", next: "", confirm: "" });
const savingProfile = ref(false);
const savingPassword = ref(false);

watch(
  () => pageContext.user,
  (user) => {
    profile.name = user?.name ?? "";
    profile.email = user?.email ?? "";
  },
  { immediate: true },
);

async function saveProfile() {
  savingProfile.value = true;
  try {
    const name = profile.name.trim();
    const email = profile.email.trim();
    const currentEmail = pageContext.user?.email?.trim() ?? "";

    const profileResult = await authClient.updateUser({ name });
    if (profileResult.error) {
      toast.error("资料保存失败，请检查昵称。");
      return;
    }

    if (email !== currentEmail) {
      const emailResult = await authClient.changeEmail({
        newEmail: email,
        callbackURL: pageContext.urlPathname,
      });
      if (emailResult.error) {
        toast.error("邮箱保存失败，请检查邮箱地址。");
        return;
      }
    }

    toast.success("账户资料已保存。");
  } catch {
    toast.error("接口异常，请稍后重试。");
  } finally {
    savingProfile.value = false;
  }
}

async function changePassword() {
  if (password.next !== password.confirm) {
    toast.error("两次输入的新密码不一致。");
    return;
  }

  savingPassword.value = true;
  try {
    const result = await authClient.changePassword({
      currentPassword: password.current,
      newPassword: password.next,
      revokeOtherSessions: true,
    });
    if (result.error) {
      toast.error("密码修改失败，请确认当前密码和新密码符合要求。");
      return;
    }
    password.current = "";
    password.next = "";
    password.confirm = "";
    toast.success("密码已修改，其他登录会话已退出。");
  } catch {
    toast.error("接口异常，请稍后重试。");
  } finally {
    savingPassword.value = false;
  }
}
</script>
