<template>
  <main class="relative flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <div class="absolute right-4 top-4"><StorefrontPreferences /></div>
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{ messages.auth.forgotPassword.title }}</CardTitle>
        <CardDescription>{{ messages.auth.forgotPassword.description }}</CardDescription>
      </CardHeader>
      <form novalidate @submit.prevent="submit">
        <CardContent>
          <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true">
            <Field :data-invalid="errors.length > 0">
              <FieldLabel for="forgot-password-email">{{ messages.auth.forgotPassword.email }}</FieldLabel>
              <Input id="forgot-password-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" />
              <FieldDescription>{{ messages.auth.forgotPassword.privacyNotice }}</FieldDescription>
              <FieldError v-if="errors.length" :errors="errors" />
            </Field>
          </VeeField>
        </CardContent>
        <CardFooter class="mt-6 flex-col gap-3">
          <Button class="w-full" type="submit" :disabled="isSubmitting">{{ isSubmitting ? messages.auth.forgotPassword.sending : messages.auth.forgotPassword.sendResetLink }}</Button>
          <Button as="a" href="/login" class="w-full" variant="ghost">{{ messages.auth.forgotPassword.backToLogin }}</Button>
        </CardFooter>
      </form>
    </Card>
  </main>
</template>

<script lang="ts" setup>
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { toast } from "vue-sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import StorefrontPreferences from "@/components/storefront/StorefrontPreferences.vue";
import { authClient } from "@/lib/auth-client";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const { messages } = useStorefrontPreferences();

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(z.object({
    email: z.string().trim().email(messages.value.auth.forgotPassword.emailInvalid).max(320, messages.value.auth.forgotPassword.emailTooLong),
  })),
  initialValues: { email: "" },
});

const submit = handleSubmit(async ({ email }) => {
  try {
    await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: "/reset-password",
    });
  } catch {
    // Keep the response indistinguishable to prevent account enumeration.
  }
  toast.success(messages.value.auth.forgotPassword.success);
});
</script>
