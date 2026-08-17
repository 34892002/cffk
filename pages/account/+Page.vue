<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-5">
        <StorefrontBrand />
        <PublicNav />
      </div>
    </header>

    <section class="mx-auto flex max-w-5xl flex-col gap-6 px-5 pb-12 pt-26">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">{{ messages.account.title }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ messages.account.description }}</p>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{{ messages.account.profile.title }}</CardTitle>
            <CardDescription>{{ messages.account.profile.description }}</CardDescription>
          </CardHeader>
          <VeeForm class="flex flex-col gap-4" :validation-schema="toTypedSchema(profileSchema)" :initial-values="profileInitialValues" novalidate @submit="submitProfile">
            <CardContent class="grid gap-5">
              <div class="flex items-center gap-3">
                <Avatar class="size-11">
                  <AvatarFallback>{{ avatarText }}</AvatarFallback>
                </Avatar>
                <div class="min-w-0">
                  <p class="truncate font-medium">{{ user.name || messages.account.profile.nameUnset }}</p>
                  <p class="truncate text-sm text-muted-foreground">{{ user.email || messages.account.email.unset }}</p>
                </div>
              </div>
              <VeeField v-slot="{ componentField, errors }" name="profileName">
                <Field :data-invalid="errors.length > 0">
                  <FieldLabel for="profile-name"><span class="text-destructive">*</span> {{ messages.account.addressFields.name }}</FieldLabel>
                  <Input id="profile-name" v-bind="componentField" autocomplete="name" :aria-invalid="errors.length > 0" />
                  <FieldError v-if="errors.length" :errors="errors" />
                </Field>
              </VeeField>
            </CardContent>
            <CardFooter class="justify-end"><Button type="submit" :disabled="savingProfile">{{ savingProfile ? messages.account.actions.saving : messages.account.actions.save }}</Button></CardFooter>
          </VeeForm>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{{ messages.account.email.title }}</CardTitle>
            <CardDescription>{{ messages.account.email.description }}</CardDescription>
          </CardHeader>
          <VeeForm class="flex flex-col gap-4" :validation-schema="toTypedSchema(emailSchema)" :initial-values="emailInitialValues" novalidate @submit="submitEmailChange">
            <CardContent class="grid gap-4">
              <div class="rounded-lg border px-4 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-medium">{{ messages.account.email.current }}</p>
                  <Badge :variant="user.emailVerified ? 'secondary' : 'outline'">{{ user.emailVerified ? messages.account.email.verified : messages.account.email.unverified }}</Badge>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{{ user.email || messages.account.email.unset }}</p>
              </div>
              <VeeField v-slot="{ componentField, errors }" name="email">
                <Field :data-invalid="errors.length > 0">
                  <FieldLabel for="new-email"><span class="text-destructive">*</span> {{ messages.account.email.new }}</FieldLabel>
                  <Input id="new-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" />
                  <FieldError v-if="errors.length" :errors="errors" />
                </Field>
              </VeeField>
              <p class="text-sm text-muted-foreground">{{ messages.account.email.verificationNotice }}</p>
            </CardContent>
            <CardFooter class="justify-end"><Button type="submit" :disabled="savingEmail || emailCooldown > 0">{{ savingEmail ? messages.account.email.sending : emailCooldown > 0 ? t(messages.account.email.resendAfter, { seconds: emailCooldown }) : messages.account.email.change }}</Button></CardFooter>
          </VeeForm>
        </Card>

        <Card class="lg:col-span-2">
          <CardHeader>
            <CardTitle>{{ messages.account.password.title }}</CardTitle>
            <CardDescription>{{ messages.account.password.description }}</CardDescription>
          </CardHeader>
          <VeeForm class="flex flex-col gap-4" :validation-schema="toTypedSchema(passwordSchema)" novalidate @submit="submitPassword">
            <CardContent class="grid gap-4 md:grid-cols-3">
              <VeeField v-slot="{ componentField, errors }" name="currentPassword"><Field :data-invalid="errors.length > 0"><FieldLabel for="current-password"><span class="text-destructive">*</span> {{ messages.account.password.current }}</FieldLabel><Input id="current-password" v-bind="componentField" type="password" autocomplete="current-password" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
              <VeeField v-slot="{ componentField, errors }" name="newPassword"><Field :data-invalid="errors.length > 0"><FieldLabel for="new-password"><span class="text-destructive">*</span> {{ messages.account.password.new }}</FieldLabel><Input id="new-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
              <VeeField v-slot="{ componentField, errors }" name="confirmPassword"><Field :data-invalid="errors.length > 0"><FieldLabel for="confirm-password"><span class="text-destructive">*</span> {{ messages.account.password.confirm }}</FieldLabel><Input id="confirm-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            </CardContent>
            <CardFooter class="justify-end"><Button type="submit" :disabled="savingPassword">{{ savingPassword ? messages.account.password.changing : messages.account.password.title }}</Button></CardFooter>
          </VeeForm>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>{{ messages.account.addresses.title }}</CardTitle>
              <CardDescription>{{ t(messages.account.addresses.description, { limit: ADDRESS_LIMIT }) }}</CardDescription>
            </div>
            <Button :disabled="loading || addresses.length >= ADDRESS_LIMIT" @click="openCreate">
              <PlusIcon data-icon="inline-start" />
              {{ messages.account.addresses.add }}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p v-if="addresses.length >= ADDRESS_LIMIT" class="mb-4 text-sm text-muted-foreground">{{ t(messages.account.addresses.limitReached, { limit: ADDRESS_LIMIT }) }}</p>
          <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">{{ messages.account.addresses.loading }}</div>
          <Empty v-else-if="!addresses.length" class="border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><MapPinIcon /></EmptyMedia>
              <EmptyTitle>{{ messages.account.addresses.emptyTitle }}</EmptyTitle>
              <EmptyDescription>{{ messages.account.addresses.emptyDescription }}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button variant="outline" @click="openCreate">{{ messages.account.addresses.addFirst }}</Button></EmptyContent>
          </Empty>
          <div v-else class="grid gap-4 md:grid-cols-2">
            <article v-for="address in addresses" :key="address.id" class="flex flex-col gap-4 rounded-lg border bg-card p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="font-medium">{{ address.recipientName }}</h2>
                    <Badge v-if="address.isDefault" variant="secondary">{{ messages.account.addresses.defaultBadge }}</Badge>
                  </div>
                  <p class="mt-1 text-sm text-muted-foreground">{{ address.phone }}</p>
                </div>
                <Button size="icon-sm" variant="ghost" :aria-label="messages.account.addresses.editAriaLabel" @click="openEdit(address)"><PencilIcon /></Button>
              </div>
              <p class="text-sm leading-6">{{ formatAddress(address) }}</p>
              <p v-if="address.postalCode" class="text-xs text-muted-foreground">{{ t(messages.account.addresses.postalCodeValue, { postalCode: address.postalCode }) }}</p>
              <div class="mt-auto flex flex-wrap justify-end gap-2">
                <Button v-if="!address.isDefault" size="sm" variant="outline" :disabled="busyId === address.id" @click="setDefault(address)">{{ messages.account.addresses.setDefault }}</Button>
                <Button size="sm" variant="destructive" :disabled="busyId === address.id" @click="requestDelete(address)">{{ messages.account.actions.delete }}</Button>
              </div>
            </article>
          </div>
        </CardContent>
      </Card>
    </section>

    <Dialog :open="editorOpen" @update:open="onEditorOpenChange">
      <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader class="border-b px-6 py-5 pr-14">
          <DialogTitle>{{ editingAddress ? messages.account.addresses.editTitle : messages.account.addresses.createTitle }}</DialogTitle>
          <DialogDescription>{{ messages.account.addresses.editorDescription }}</DialogDescription>
        </DialogHeader>
        <form id="address-form" class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="submitAddress">
          <div class="min-h-0 overflow-y-auto px-6 py-5">
            <FieldGroup>
              <div class="grid gap-4 sm:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="recipientName"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-recipient"><span class="text-destructive">*</span> {{ messages.account.addressFields.recipientName }}</FieldLabel><Input id="address-recipient" v-bind="componentField" autocomplete="name" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="phone"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-phone"><span class="text-destructive">*</span> {{ messages.account.addressFields.phone }}</FieldLabel><Input id="address-phone" v-bind="componentField" inputmode="tel" autocomplete="tel" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="country"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-country"><span class="text-destructive">*</span> {{ messages.account.addressFields.country }}</FieldLabel><Input id="address-country" v-bind="componentField" autocomplete="country-name" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="province"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-province"><span class="text-destructive">*</span> {{ messages.account.addressFields.province }}</FieldLabel><Input id="address-province" v-bind="componentField" autocomplete="address-level1" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="city"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-city"><span class="text-destructive">*</span> {{ messages.account.addressFields.city }}</FieldLabel><Input id="address-city" v-bind="componentField" autocomplete="address-level2" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="district"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-district"><span class="text-destructive">*</span> {{ messages.account.addressFields.district }}</FieldLabel><Input id="address-district" v-bind="componentField" autocomplete="address-level3" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
              </div>
              <VeeField v-slot="{ componentField, errors }" name="addressLine"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-line"><span class="text-destructive">*</span> {{ messages.account.addressFields.addressLine }}</FieldLabel><Input id="address-line" v-bind="componentField" autocomplete="street-address" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
              <VeeField v-slot="{ componentField, errors }" name="postalCode"><Field :data-invalid="errors.length > 0"><FieldLabel for="address-postal-code">{{ messages.account.addressFields.postalCode }}</FieldLabel><Input id="address-postal-code" v-bind="componentField" autocomplete="postal-code" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
              <VeeField v-slot="{ value, handleChange }" name="isDefault"><Field orientation="horizontal"><Checkbox id="address-default" :model-value="value" @update:model-value="handleChange(Boolean($event))" /><FieldLabel for="address-default" class="font-normal">{{ messages.account.addressFields.isDefault }}</FieldLabel></Field></VeeField>
            </FieldGroup>
          </div>
          <DialogFooter class="border-t bg-background px-6 py-4">
            <Button type="button" variant="outline" :disabled="saving" @click="editorOpen = false">{{ messages.account.actions.cancel }}</Button>
            <Button type="submit" :disabled="saving">{{ saving ? messages.account.actions.saving : messages.account.addresses.save }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteOpen" @update:open="onDeleteOpenChange">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ messages.account.addresses.deleteTitle }}</DialogTitle>
          <DialogDescription>{{ t(messages.account.addresses.deleteDescription, { recipientName: deletingAddress?.recipientName ?? "" }) }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="deleting" @click="deleteOpen = false">{{ messages.account.actions.cancel }}</Button>
          <Button type="button" variant="destructive" :disabled="deleting" @click="deleteAddress">{{ deleting ? messages.account.actions.deleting : messages.account.addresses.confirmDelete }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { MapPinIcon, PencilIcon, PlusIcon } from "@lucide/vue";
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, Form as VeeForm, useForm } from "vee-validate";
import { usePageContext } from "vike-vue/usePageContext";
import { toast } from "vue-sonner";
import { z } from "zod";
import PublicNav from "@/components/storefront/PublicNav.vue";
import StorefrontBrand from "@/components/storefront/StorefrontBrand.vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { runTelefunc } from "@/lib/telefunc-client";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";
import { onCreateAddress, onDeleteAddress, onListAddresses, onSetDefaultAddress, onUpdateAddress } from "@/server/address/index.telefunc";

const { messages, t } = useStorefrontPreferences();
const ADDRESS_LIMIT = 10;
const phonePattern = /^[0-9+()\-\s]{5,32}$/;
const postalCodePattern = /^[A-Za-z0-9][A-Za-z0-9\- ]{0,19}$/;
const requiredText = (label: string, max: number) => z.string().trim().min(1, t(messages.value.account.validation.required, { label })).max(max, t(messages.value.account.validation.maxLength, { label, max }));
const profileSchema = z.object({ profileName: requiredText(messages.value.account.addressFields.name, 100) });
const emailSchema = z.object({ email: z.string().trim().min(1, messages.value.account.validation.emailRequired).email(messages.value.account.validation.emailInvalid).max(320, messages.value.account.validation.emailMaxLength).transform((value) => value.toLowerCase()) });
const passwordSchema = z.object({
  currentPassword: z.string().min(1, messages.value.account.validation.currentPasswordRequired),
  newPassword: z.string().min(8, messages.value.account.validation.newPasswordTooShort).max(128, messages.value.account.validation.newPasswordTooLong),
  confirmPassword: z.string().min(1, messages.value.account.validation.confirmPasswordRequired),
}).refine((value) => value.newPassword === value.confirmPassword, { path: ["confirmPassword"], message: messages.value.account.validation.passwordsMismatch });
const addressSchema = z.object({
  recipientName: requiredText(messages.value.account.addressFields.recipientName, 100),
  phone: requiredText(messages.value.account.addressFields.phone, 32).regex(phonePattern, messages.value.account.validation.phoneInvalid),
  country: requiredText(messages.value.account.addressFields.country, 100),
  province: requiredText(messages.value.account.addressFields.province, 100),
  city: requiredText(messages.value.account.addressFields.city, 100),
  district: requiredText(messages.value.account.addressFields.district, 100),
  addressLine: requiredText(messages.value.account.addressFields.addressLine, 500),
  postalCode: z.string().trim().max(20, t(messages.value.account.validation.maxLength, { label: messages.value.account.addressFields.postalCode, max: 20 })).refine((value) => !value || postalCodePattern.test(value), messages.value.account.validation.postalCodeInvalid),
  isDefault: z.boolean(),
});
type ProfileForm = z.infer<typeof profileSchema>;
type EmailForm = z.infer<typeof emailSchema>;
type AddressForm = z.infer<typeof addressSchema>;
type Address = Awaited<ReturnType<typeof onListAddresses>>[number];
type PublicUser = { id: string; name?: string | null; email?: string | null; emailVerified?: boolean | null };

const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user: PublicUser };
const user = pageContext.user;
const addresses = ref<Address[]>([]);
const loading = ref(true);
const editorOpen = ref(false);
const editingAddress = ref<Address | null>(null);
const saving = ref(false);
const busyId = ref<number | null>(null);
const deleteOpen = ref(false);
const deletingAddress = ref<Address | null>(null);
const deleting = ref(false);
const avatarText = computed(() => (user.name?.trim() || user.email?.trim() || messages.value.account.avatarFallback).slice(0, 1).toUpperCase());

const savingProfile = ref(false);
const savingEmail = ref(false);
const savingPassword = ref(false);
const emailCooldown = ref(0);
let emailCooldownTimer: ReturnType<typeof setInterval> | undefined;
const profileInitialValues: ProfileForm = { profileName: user.name ?? "" };
const emailInitialValues: EmailForm = { email: "" };
const { handleSubmit, resetForm } = useForm<AddressForm>({ validationSchema: toTypedSchema(addressSchema), initialValues: emptyAddress() });

function emptyAddress(): AddressForm {
  return { recipientName: "", phone: "", country: messages.value.account.addresses.defaultCountry, province: "", city: "", district: "", addressLine: "", postalCode: "", isDefault: false };
}

async function submitProfile(form: Record<string, unknown>) {
  const parsed = profileSchema.safeParse(form);
  if (!parsed.success) return;

  const name = parsed.data.profileName.trim();
  if (name === (user.name?.trim() ?? "")) {
    toast.info(messages.value.account.profile.unchanged);
    return;
  }

  savingProfile.value = true;
  try {
    const result = await authClient.updateUser({ name });
    if (result.error) {
      toast.error(messages.value.account.profile.saveFailed);
      return;
    }
    user.name = name;
    toast.success(messages.value.account.profile.updated);
  } catch {
    toast.error(messages.value.account.profile.saveFailed);
  } finally {
    savingProfile.value = false;
  }
}

function startEmailCooldown() {
  emailCooldown.value = 60;
  if (emailCooldownTimer) clearInterval(emailCooldownTimer);
  emailCooldownTimer = setInterval(() => {
    emailCooldown.value -= 1;
    if (emailCooldown.value <= 0 && emailCooldownTimer) {
      clearInterval(emailCooldownTimer);
      emailCooldownTimer = undefined;
    }
  }, 1_000);
}

async function submitEmailChange(form: Record<string, unknown>) {
  const parsed = emailSchema.safeParse(form);
  if (!parsed.success || emailCooldown.value > 0) return;
  if (parsed.data.email === (user.email?.trim().toLowerCase() ?? "")) {
    toast.info(messages.value.account.email.sameAsCurrent);
    return;
  }

  savingEmail.value = true;
  try {
    const result = await authClient.changeEmail({ newEmail: parsed.data.email, callbackURL: "/account" });
    if (result.error) {
      toast.error(messages.value.account.email.sendFailedWithLimit);
      return;
    }
    startEmailCooldown();
    toast.success(messages.value.account.email.verificationSent);
  } catch {
    toast.error(messages.value.account.email.sendFailed);
  } finally {
    savingEmail.value = false;
  }
}

async function submitPassword(form: Record<string, unknown>, actions: { resetForm: () => void }) {
  const parsed = passwordSchema.safeParse(form);
  if (!parsed.success) return;

  savingPassword.value = true;
  try {
    const result = await authClient.changePassword({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword, revokeOtherSessions: true });
    if (result.error) {
      toast.error(messages.value.account.password.changeFailedInvalid);
      return;
    }
    actions.resetForm();
    toast.success(messages.value.account.password.changed);
  } catch {
    toast.error(messages.value.account.password.changeFailed);
  } finally {
    savingPassword.value = false;
  }
}

async function loadAddresses() {
  loading.value = true;
  try {
    addresses.value = await runTelefunc(() => onListAddresses(), { notifyError: false });
  } catch {
    toast.error(messages.value.account.addresses.loadFailed);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  if (addresses.value.length >= ADDRESS_LIMIT) {
    toast.info(t(messages.value.account.addresses.limitToast, { limit: ADDRESS_LIMIT }));
    return;
  }
  editingAddress.value = null;
  resetForm({ values: { ...emptyAddress(), isDefault: addresses.value.length === 0 } });
  editorOpen.value = true;
}

function openEdit(address: Address) {
  editingAddress.value = address;
  resetForm({ values: { recipientName: address.recipientName, phone: address.phone, country: address.country, province: address.province, city: address.city, district: address.district, addressLine: address.addressLine, postalCode: address.postalCode ?? "", isDefault: address.isDefault } });
  editorOpen.value = true;
}

function onEditorOpenChange(open: boolean) {
  if (!saving.value) editorOpen.value = open;
}

const submitAddress = handleSubmit(async (form) => {
  saving.value = true;
  try {
    const input = { ...form, postalCode: form.postalCode || undefined };
    if (editingAddress.value) await runTelefunc(() => onUpdateAddress(editingAddress.value!.id, input), { successMessage: messages.value.account.addresses.updated });
    else await runTelefunc(() => onCreateAddress(input), { successMessage: messages.value.account.addresses.created });
    editorOpen.value = false;
    await loadAddresses();
  } catch {
    // runTelefunc owns the sanitized error toast.
  } finally {
    saving.value = false;
  }
}, () => toast.error(messages.value.account.addresses.invalidForm));

async function setDefault(address: Address) {
  busyId.value = address.id;
  try {
    await runTelefunc(() => onSetDefaultAddress(address.id), { successMessage: messages.value.account.addresses.defaultUpdated });
    await loadAddresses();
  } catch {
    // runTelefunc owns the sanitized error toast.
  } finally {
    busyId.value = null;
  }
}

function requestDelete(address: Address) {
  deletingAddress.value = address;
  deleteOpen.value = true;
}

function onDeleteOpenChange(open: boolean) {
  if (!deleting.value) deleteOpen.value = open;
  if (!open && !deleting.value) deletingAddress.value = null;
}

async function deleteAddress() {
  if (!deletingAddress.value) return;
  deleting.value = true;
  try {
    await runTelefunc(() => onDeleteAddress(deletingAddress.value!.id), { successMessage: messages.value.account.addresses.deleted });
    deleteOpen.value = false;
    deletingAddress.value = null;
    await loadAddresses();
  } catch {
    // runTelefunc owns the sanitized error toast.
  } finally {
    deleting.value = false;
  }
}

function formatAddress(address: Address) {
  return [address.country, address.province, address.city, address.district, address.addressLine].filter(Boolean).join(" ");
}

onMounted(loadAddresses);
onBeforeUnmount(() => {
  if (emailCooldownTimer) clearInterval(emailCooldownTimer);
});
</script>
