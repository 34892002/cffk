<template>
  <main class="relative flex min-h-screen items-center justify-center bg-muted/30 p-6">
    <div class="absolute right-4 top-4"><StorefrontPreferences /></div>
    <Alert v-if="!rootInitialized" class="w-full max-w-md">
      <AlertTitle>{{ messages.auth.signup.unavailable }}</AlertTitle>
      <AlertDescription>{{ messages.auth.signup.notInitialized }}</AlertDescription>
    </Alert>

    <Alert v-else-if="!registrationEnabled" class="w-full max-w-md">
      <AlertTitle>{{ messages.auth.signup.unavailable }}</AlertTitle>
      <AlertDescription>{{ messages.auth.signup.disabled }}</AlertDescription>
    </Alert>

    <Card v-else class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{ messages.auth.signup.title }}</CardTitle>
        <CardDescription>{{ messages.auth.signup.description }}</CardDescription>
      </CardHeader>
      <form novalidate @submit.prevent="submit">
        <CardContent>
          <FieldGroup>
            <VeeField v-slot="{ componentField, errors }" name="name" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="signup-name">{{ messages.auth.signup.name }}</FieldLabel>
                <Input id="signup-name" v-bind="componentField" autocomplete="name" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
            <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="signup-email">{{ messages.auth.signup.email }}</FieldLabel>
                <Input id="signup-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
            <VeeField v-slot="{ componentField, errors }" name="password" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="signup-password">{{ messages.auth.signup.password }}</FieldLabel>
                <Input id="signup-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
            <VeeField v-slot="{ componentField, errors }" name="confirmPassword" :validate-on-input="true">
              <Field :data-invalid="errors.length > 0">
                <FieldLabel for="signup-confirm-password">{{ messages.auth.signup.confirmPassword }}</FieldLabel>
                <Input id="signup-confirm-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" />
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
          </FieldGroup>
        </CardContent>
        <CardFooter class="mt-6 flex-col gap-3">
          <Button class="w-full" type="submit" :disabled="isSubmitting">{{ isSubmitting ? messages.auth.signup.signingUp : messages.auth.signup.signUp }}</Button>
          <Button as="a" href="/login" class="w-full" variant="ghost">{{ messages.auth.signup.haveAccount }}</Button>
        </CardFooter>
      </form>
    </Card>
  </main>
</template>

<script lang="ts" setup>
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";

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

const pageContext = usePageContext() as ReturnType<typeof usePageContext> & {
  rootInitialized?: boolean;
  registrationEnabled?: boolean;
};
const { messages } = useStorefrontPreferences();
const rootInitialized = Boolean(pageContext.rootInitialized);
const registrationEnabled = pageContext.registrationEnabled === true;
const schema = z.object({

  name: z.string().trim().min(1, messages.value.auth.signup.nameRequired).max(100, messages.value.auth.signup.nameTooLong),
  email: z.string().trim().email(messages.value.auth.signup.emailInvalid).max(320, messages.value.auth.signup.emailTooLong),
  password: z.string().min(8, messages.value.auth.signup.passwordTooShort).max(128, messages.value.auth.signup.passwordTooLong),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: messages.value.auth.signup.passwordsMismatch });

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: { name: "", email: "", password: "", confirmPassword: "" },
});

const submit = handleSubmit(async ({ confirmPassword: _confirmPassword, ...input }) => {
  if (!rootInitialized || !registrationEnabled) return;
  try {
    const result = await authClient.signUp.email(input);
    if (result.error) {
      toast.error(messages.value.auth.signup.failed);
      return;
    }
    toast.success(messages.value.auth.signup.submitted);
  } catch {
    toast.error(messages.value.auth.signup.requestFailed);
  }
});
</script>
