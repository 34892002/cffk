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
              <FieldDescription>{{ messages.auth.forgotPassword.emailHint }}</FieldDescription>
              <FieldError v-if="errors.length" :errors="errors" />
            </Field>
          </VeeField>
          <div v-if="turnstileSiteKey" ref="turnstileElement" class="mt-5 min-h-16" />
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
import { nextTick, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import StorefrontPreferences from "@/components/storefront/StorefrontPreferences.vue";
import { authClient } from "@/lib/auth-client";
import { classifyAuthError } from "@/lib/auth-error-messages";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const { messages } = useStorefrontPreferences();

const turnstileElement = ref<HTMLElement | null>(null);
const turnstileSiteKey = ref<string | null>(null);
const turnstileToken = ref("");
const turnstileWidgetId = ref<string | null>(null);

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => string; reset: (widgetId?: string) => void; }; } }

async function loadTurnstile() {
  const config = await fetch("/api/security/turnstile").then((response) => response.json() as Promise<{ enabled: boolean; siteKey: string | null }>);
  if (!config.enabled || !config.siteKey) return;
  turnstileSiteKey.value = config.siteKey;
  await nextTick();
  await new Promise<void>((resolve, reject) => {
    if (window.turnstile) { resolve(); return; }
    const script = window.document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("TURNSTILE_LOAD_FAILED")); window.document.head.appendChild(script);
  });
  if (turnstileElement.value) turnstileWidgetId.value = window.turnstile?.render(turnstileElement.value, { sitekey: config.siteKey, callback: (token) => { turnstileToken.value = token; }, "expired-callback": () => { turnstileToken.value = ""; } }) ?? null;
}

function resetTurnstile() {
  turnstileToken.value = "";
  if (turnstileWidgetId.value) window.turnstile?.reset(turnstileWidgetId.value);
}

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(z.object({
    email: z.string().trim().email(messages.value.auth.forgotPassword.emailInvalid).max(320, messages.value.auth.forgotPassword.emailTooLong),
  })),
  initialValues: { email: "" },
});

const submit = handleSubmit(async ({ email }) => {
  if (turnstileSiteKey.value && !turnstileToken.value) {
    toast.error(messages.value.auth.forgotPassword.captchaRequired);
    return;
  }
  try {
    const result = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: "/reset-password",
      ...(turnstileToken.value ? { fetchOptions: { headers: { "x-captcha-response": turnstileToken.value } } } : {}),
    });
    if (result.error) {
      const kind = classifyAuthError(result.error);
      if (kind === "captcha") {
        toast.error(messages.value.auth.forgotPassword.captchaFailed);
        return;
      }
      if (kind === "rateLimited") {
        toast.error(messages.value.auth.forgotPassword.rateLimited);
        return;
      }
    }
  } catch {
    // Keep other failures indistinguishable to prevent account enumeration.
  } finally {
    resetTurnstile();
  }
  toast.success(messages.value.auth.forgotPassword.success);
});

onMounted(() => { void loadTurnstile().catch(() => { toast.error(messages.value.auth.forgotPassword.captchaLoadFailed); }); });
</script>
