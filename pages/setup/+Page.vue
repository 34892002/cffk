<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>初始化网站</CardTitle>
        <CardDescription>{{ initialized ? "网站已初始化。请通过配置的后台管理入口登录。" : "创建网站的首个 root 账号。初始化完成后，此页面将无法访问。" }}</CardDescription>
      </CardHeader>
      <form v-if="!initialized" novalidate @submit.prevent="submit">
        <CardContent>
          <FieldGroup>
            <VeeField v-slot="{ componentField, errors }" name="name" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="setup-name">昵称</FieldLabel>
                <Input id="setup-name" v-bind="componentField" autocomplete="name" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
            <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="setup-email">邮箱</FieldLabel>
                <Input id="setup-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
            <VeeField v-slot="{ componentField, errors }" name="password" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="setup-password">密码</FieldLabel>
                <Input id="setup-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
            <VeeField v-slot="{ componentField, errors }" name="confirmPassword" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="setup-confirm-password">确认密码</FieldLabel>
                <Input id="setup-confirm-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
          </FieldGroup>
        </CardContent>
        <CardFooter class="mt-6">
          <Button class="w-full" type="submit" :disabled="isSubmitting">{{ isSubmitting ? "初始化中..." : "创建 root 账号" }}</Button>
        </CardFooter>
      </form>
    </Card>
  </main>
</template>

<script lang="ts" setup>
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { ref } from "vue";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { runTelefunc } from "@/lib/telefunc-client";
import { onSetupRoot } from "@/server/setup.telefunc";

const initialized = ref(false);

const schema = z.object({

  name: z.string().trim().min(1, "请输入昵称。").max(100, "昵称不能超过 100 个字符。"),
  email: z.string().trim().email("请输入有效邮箱。").max(320, "邮箱地址过长。"),
  password: z.string().min(8, "密码至少需要 8 位字符。").max(128, "密码不能超过 128 位字符。"),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "两次输入的密码不一致。",
});

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: { name: "root", email: "", password: "", confirmPassword: "" },
});

const submit = handleSubmit(async ({ confirmPassword: _confirmPassword, ...input }) => {
  try {
    await runTelefunc(() => onSetupRoot(input), { successMessage: "网站初始化完成。" });
    initialized.value = true;
  } catch {
    // runTelefunc 已显示脱敏错误。
  }
});
</script>
