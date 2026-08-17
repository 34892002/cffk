<template>
  <main class="min-h-screen bg-muted/30 p-4 sm:p-6 lg:p-8">
    <div class="absolute right-4 top-4 z-10 sm:right-6 sm:top-6"><StorefrontPreferences /></div>
    <div class="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-lg border bg-background shadow-sm lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1.15fr)_26rem]">
      <section class="relative hidden overflow-hidden border-r bg-muted/30 p-10 lg:flex lg:flex-col">
        <a href="/" class="flex min-w-0 items-center gap-3 text-lg font-semibold" :aria-label="messages.auth.login.homeAriaLabel"><img :src="brandLogoUrl" :alt="`${siteName} Logo`" class="size-10 shrink-0 rounded-md object-contain" /><span class="truncate">{{ siteName }}</span></a>
        <div class="my-auto max-w-xl py-12">
          <p class="text-sm font-medium text-muted-foreground">{{ messages.auth.login.tagline }}</p>
          <h1 class="mt-4 whitespace-pre-line text-4xl font-semibold leading-tight tracking-normal">{{ messages.auth.login.headline }}</h1>
          <p class="mt-5 max-w-sm text-base leading-7 text-muted-foreground">{{ messages.auth.login.description }}</p>
          <div class="mt-10 grid grid-cols-[7.5rem_minmax(2rem,1fr)_7.5rem_minmax(2rem,1fr)_7.5rem] items-center">
            <div class="grid aspect-square min-w-0 place-items-center content-center gap-3 rounded-lg border bg-card p-3 text-center shadow-sm"><span class="grid size-10 place-items-center rounded-md bg-secondary"><ShoppingCartIcon class="size-5" /></span><span class="text-sm font-medium">{{ messages.auth.login.createOrder }}</span></div>
            <div class="relative h-full" aria-hidden="true"><div class="absolute inset-x-0 top-1/2 border-t border-dashed border-muted-foreground/40" /><ArrowRightIcon class="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 bg-muted/50 text-muted-foreground" /></div>
            <div class="grid aspect-square min-w-0 place-items-center content-center gap-3 rounded-lg border border-login-payment-border bg-login-payment p-3 text-center"><span class="grid size-10 place-items-center rounded-md bg-login-payment-icon text-login-payment-icon-foreground"><ShieldCheckIcon class="size-5" /></span><span class="text-sm font-medium text-login-payment-foreground">{{ messages.auth.login.securePayment }}</span></div>
            <div class="relative h-full" aria-hidden="true"><div class="absolute inset-x-0 top-1/2 border-t border-dashed border-muted-foreground/40" /><ArrowRightIcon class="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 bg-muted/50 text-muted-foreground" /></div>
            <div class="grid aspect-square min-w-0 place-items-center content-center gap-3 rounded-lg border border-login-delivery-border bg-login-delivery p-3 text-center"><span class="grid size-10 place-items-center rounded-md bg-login-delivery-icon text-login-delivery-icon-foreground"><PackageCheckIcon class="size-5" /></span><span class="text-sm font-medium text-login-delivery-foreground">{{ messages.auth.login.delivery }}</span></div>
          </div>
        </div>
        <p class="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyholeIcon class="size-4" />{{ messages.auth.login.sslProtected }}</p>
      </section>

      <section class="flex min-w-0 items-center justify-center p-5 sm:p-8">
        <Card class="w-full max-w-md border bg-card shadow-sm">
          <CardHeader class="px-6 pt-6 sm:px-8 sm:pt-8">
            <a href="/" class="mb-8 flex min-w-0 items-center gap-3 lg:hidden" :aria-label="messages.auth.login.homeAriaLabel"><img :src="brandLogoUrl" :alt="`${siteName} Logo`" class="size-10 shrink-0 rounded-md object-contain" /><span class="truncate text-lg font-semibold">{{ siteName }}</span></a>
            <CardTitle class="text-center text-2xl tracking-normal">{{ messages.auth.login.welcomeBack }}</CardTitle>
          </CardHeader>
          <form novalidate @submit.prevent="submit">
            <CardContent class="px-6 sm:px-8">
              <FieldGroup>
                <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="login-email">{{ messages.auth.login.email }}</FieldLabel><Input id="login-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="password" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="login-password">{{ messages.auth.login.password }}</FieldLabel><Input id="login-password" v-bind="componentField" type="password" autocomplete="current-password" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
              </FieldGroup>
              <div v-if="turnstileSiteKey" ref="turnstileElement" class="mt-5 min-h-16" />
              <Alert v-if="formError" variant="destructive" class="mt-5"><AlertDescription>{{ formError }}</AlertDescription></Alert>
            </CardContent>
            <CardFooter class="mt-6 flex-col px-6 pb-6 sm:px-8 sm:pb-8"><Button class="w-full" type="submit" :disabled="isSubmitting">{{ isSubmitting ? messages.auth.login.signingIn : messages.auth.login.signIn }}</Button><div class="mt-4 grid w-full justify-items-center gap-0"><Button as="a" href="/signup" variant="link">{{ messages.auth.login.createAccount }}</Button><Button as="a" href="/forgot-password" variant="link">{{ messages.auth.login.forgotPassword }}</Button></div></CardFooter>
          </form>
        </Card>
      </section>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, nextTick, onMounted, ref } from "vue";

import { z } from "zod";
import { ArrowRightIcon, LockKeyholeIcon, PackageCheckIcon, ShieldCheckIcon, ShoppingCartIcon } from "@lucide/vue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import StorefrontPreferences from "@/components/storefront/StorefrontPreferences.vue";
import { authClient } from "@/lib/auth-client";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";
import logoUrl from "@/assets/logo.svg?url";

type Site = { name?: string | null; logo?: string | null };
const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { site?: Site | null };
const { messages } = useStorefrontPreferences();
const siteName = computed(() => pageContext.site?.name?.trim() || "CFFK-Shop");
const brandLogoUrl = computed(() => pageContext.site?.logo || logoUrl);

const turnstileElement = ref<HTMLElement | null>(null);
const turnstileSiteKey = ref<string | null>(null);
const turnstileToken = ref("");
const turnstileWidgetId = ref<string | null>(null);
const formError = ref<string | null>(null);

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
    email: z.string().trim().email(messages.value.auth.login.emailInvalid),
    password: z.string().min(1, messages.value.auth.login.passwordRequired),
  })),
  initialValues: { email: "", password: "" },
});

const submit = handleSubmit(async (input) => {
  try {
    formError.value = null;
    if (turnstileSiteKey.value && !turnstileToken.value) {
      formError.value = messages.value.auth.login.captchaRequired;
      return;
    }
    const result = await authClient.signIn.email({ ...input, ...(turnstileToken.value ? { fetchOptions: { headers: { "x-captcha-response": turnstileToken.value } } } : {}) });
    if (result.error) {
      resetTurnstile();
      formError.value = messages.value.auth.login.invalidCredentials;
      return;
    }
    if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return;
    await navigate("/auth/continue");
  } catch {
    resetTurnstile();
    formError.value = messages.value.auth.login.requestFailed;
  }
});

onMounted(() => { void loadTurnstile().catch(() => { formError.value = messages.value.auth.login.captchaLoadFailed; }); });
</script>
