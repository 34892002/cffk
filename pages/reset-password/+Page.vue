<template>
  <main class="relative flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <div class="absolute right-4 top-4"><StorefrontPreferences /></div>
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{ messages.auth.resetPassword.title }}</CardTitle>
        <CardDescription>{{ messages.auth.resetPassword.description }}</CardDescription>
      </CardHeader>

      <template v-if="token">
        <form novalidate @submit.prevent="submit">
          <CardContent>
            <FieldGroup>
              <VeeField v-slot="{ componentField, errors }" name="password" :validate-on-input="true">
                <Field :data-invalid="errors.length > 0">
                  <FieldLabel for="reset-password">{{ messages.auth.resetPassword.password }}</FieldLabel>
                  <Input id="reset-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" />
                  <FieldError v-if="errors.length" :errors="errors" />
                </Field>
              </VeeField>
              <VeeField v-slot="{ componentField, errors }" name="confirmPassword" :validate-on-input="true">
                <Field :data-invalid="errors.length > 0">
                  <FieldLabel for="reset-confirm-password">{{ messages.auth.resetPassword.confirmPassword }}</FieldLabel>
                  <Input id="reset-confirm-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" />
                  <FieldError v-if="errors.length" :errors="errors" />
                </Field>
              </VeeField>
            </FieldGroup>
          </CardContent>
          <CardFooter class="mt-6">
            <Button class="w-full" type="submit" :disabled="isSubmitting">{{ isSubmitting ? messages.auth.resetPassword.resetting : messages.auth.resetPassword.reset }}</Button>
          </CardFooter>
        </form>
      </template>

      <template v-else>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>{{ messages.auth.resetPassword.invalidTitle }}</AlertTitle>
            <AlertDescription>{{ messages.auth.resetPassword.invalidDescription }}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button as="a" href="/forgot-password" class="w-full" variant="outline">{{ messages.auth.resetPassword.backToForgotPassword }}</Button>
        </CardFooter>
      </template>
    </Card>
  </main>
</template>

<script lang="ts" setup>
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-vue/usePageContext";
import { toast } from "vue-sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import StorefrontPreferences from "@/components/storefront/StorefrontPreferences.vue";
import { authClient } from "@/lib/auth-client";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const { messages } = useStorefrontPreferences();
const rawToken = usePageContext().urlParsed.search.token;
const token = typeof rawToken === "string" && rawToken.length > 0 ? rawToken : null;
const schema = z.object({
  password: z.string().min(8, messages.value.auth.resetPassword.passwordTooShort).max(128, messages.value.auth.resetPassword.passwordTooLong),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: messages.value.auth.resetPassword.passwordsMismatch });
const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: { password: "", confirmPassword: "" },
});

const submit = handleSubmit(async ({ password }) => {
  if (!token) return;
  try {
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      toast.error(messages.value.auth.resetPassword.invalidOrExpired);
      return;
    }
    toast.success(messages.value.auth.resetPassword.success);
    await navigate("/login");
  } catch {
    toast.error(messages.value.common.requestFailed);
  }
});
</script>
