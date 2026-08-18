<template>
  <main class="flex h-dvh flex-col overflow-hidden bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur"><div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-5"><StorefrontBrand /><PublicNav /></div></header>
    <div class="mt-16 flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section class="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 pb-10 pt-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article>
          <div class="overflow-hidden rounded-xl border bg-muted"><img :src="data.coverImage || defaultProductImage" :alt="data.name" class="max-h-96 w-full object-cover" /></div>
          <div class="mt-5">
            <Badge variant="secondary">{{ data.categoryName || messages.productCheckout.defaultCategory }}</Badge>
            <h1 class="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">{{ data.name }}</h1>
            <p v-if="data.subtitle" class="mt-2 text-sm leading-6 text-muted-foreground">{{ data.subtitle }}</p>
          </div>
          <section v-if="data.description" class="mt-6 rounded-xl border bg-card p-5 sm:p-6">
            <h2 class="text-base font-semibold">{{ messages.productCheckout.productDetails }}</h2>
            <!-- `description` is sanitized server-side by sanitizeProductDescription(). -->
            <!-- eslint-disable vue/no-v-html -->
            <div ref="descriptionRef" class="product-rich-content mt-4 text-sm leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-[1.1rem] [&_h3]:font-semibold [&_img]:my-4 [&_img]:block [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:border [&_img]:transition-opacity [&_img]:hover:opacity-90 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6" @click="previewDescriptionImage" v-html="data.description" />
          <!-- eslint-enable vue/no-v-html -->
          </section>
          <section class="mt-6 rounded-xl border bg-muted/30 p-5 text-sm leading-6 sm:p-6">
            <h2 class="font-semibold">{{ messages.productCheckout.purchaseInstructions }}</h2>
            <div class="mt-3 grid gap-3 text-muted-foreground"><p class="whitespace-pre-wrap">{{ purchaseNote }}</p><p v-if="deliveryHint" class="whitespace-pre-wrap">{{ deliveryHint }}</p></div>
          </section>
        </article>
        <aside class="h-fit lg:sticky lg:top-0">
          <Card>
            <CardHeader><CardDescription>{{ messages.productCheckout.currentPrice }}</CardDescription><CardTitle class="text-3xl text-orange-600">¥{{ data.price }}</CardTitle></CardHeader><form class="grid min-w-0 gap-6" novalidate @submit.prevent="submit">
              <CardContent class="grid min-w-0 gap-4">
                <p v-if="requiresPayment && !methods.length" class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{{ messages.productCheckout.noPaymentMethod }}</p>
                <label class="grid min-w-0 gap-2 text-sm font-medium"><span class="flex items-center gap-1"><span class="text-destructive">*</span> {{ messages.productCheckout.contactEmail }}</span><Input v-model="contactValue" type="email" autocomplete="email" required /></label>
                <label class="grid min-w-0 gap-2 text-sm font-medium"><span class="flex items-center gap-1"><span class="text-destructive">*</span> {{ messages.productCheckout.quantity }}</span><Input v-model.number="quantity" type="number" :min="data.minBuy" :max="purchaseLimit" required /><span v-if="isStockLimited" class="text-xs font-normal text-muted-foreground">{{ t(messages.productCheckout.availableStock, { count: availableStock }) }}</span></label>
                <FieldSet v-if="data.deliveryType === 'EXPRESS'" class="min-w-0 gap-4">
                  <FieldLegend>{{ messages.productCheckout.shippingAddress }}</FieldLegend>
                  <Field v-if="addresses.length" class="min-w-0"><FieldLabel for="checkout-address">{{ messages.productCheckout.selectSavedAddress }}</FieldLabel><Select :model-value="selectedAddress" class="block w-full min-w-0" @update:model-value="onAddressSelectionChange"><SelectTrigger id="checkout-address" class="w-full! min-w-0 max-w-full **:data-[slot=select-value]:min-w-0 **:data-[slot=select-value]:flex-1 **:data-[slot=select-value]:truncate"><SelectValue :placeholder="messages.productCheckout.selectShippingAddress" /></SelectTrigger><SelectContent><SelectItem v-for="item in addresses" :key="String(item.id)" :value="String(item.id)">{{ item.recipientName }} · {{ item.phone }} · {{ addressSummary(item) }}</SelectItem><SelectItem value="new">{{ messages.productCheckout.enterNewAddress }}</SelectItem><SelectItem v-if="!user" value="clear-local-addresses" class="text-destructive focus:text-destructive">{{ messages.productCheckout.clearBrowserAddresses }}</SelectItem></SelectContent></Select></Field>
                  <p v-else-if="addressesLoading" class="text-sm text-muted-foreground">{{ messages.productCheckout.loadingSavedAddresses }}</p>
                  <div v-if="selectedAddress === 'new' || !addresses.length" class="grid gap-4 sm:grid-cols-2">
                    <VeeField v-for="field in addressFieldsWithoutPostalCode" :key="field.name" v-slot="{ componentField, errors }" :name="field.name" :validate-on-input="true"><Field :class="'wide' in field && field.wide ? 'sm:col-span-2' : ''" :data-invalid="errors.length > 0"><FieldLabel :for="`checkout-${field.name}`"><span v-if="field.required" class="text-destructive">*</span> {{ field.label }}</FieldLabel><Input :id="`checkout-${field.name}`" v-bind="componentField" :autocomplete="field.autocomplete" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                    <div class="grid gap-4 sm:col-span-2">
                      <VeeField v-slot="{ componentField, errors }" name="postalCode" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="checkout-postalCode">{{ messages.productCheckout.address.postalCode }}</FieldLabel><Input id="checkout-postalCode" v-bind="componentField" autocomplete="postal-code" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                      <Button type="button" variant="outline" class="w-full" :disabled="savingAddress" @click="saveCurrentAddress">{{ savingAddress ? messages.productCheckout.savingAddress : messages.productCheckout.saveAddress }}</Button>
                    </div>
                  </div>
                </FieldSet>
                <div v-if="methods.length" class="grid gap-2 text-sm font-medium">
                  <span>{{ messages.productCheckout.paymentMethod }}</span>
                  <div class="grid grid-cols-2 gap-2" role="group" :aria-label="messages.productCheckout.paymentMethod">
                    <Button
                      v-for="item in methods"
                      :key="item.key"
                      type="button"
                      :variant="selectedMethod === item.key ? 'default' : 'outline'"
                      class="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-left text-sm leading-5"
                      :aria-pressed="selectedMethod === item.key"
                      @click="selectedMethod = item.key"
                    >
                      {{ item.name }}{{ item.channel ? `（${channelLabel(item.channel)}）` : "" }}
                    </Button>
                  </div>
                </div>
                <div class="grid gap-2 text-sm font-medium"><span>{{ messages.productCheckout.discountCode }}</span><div class="flex gap-2"><Input v-model="discountCode" autocomplete="off" @keydown.enter.prevent="onApplyDiscount" /><Button type="button" variant="outline" :disabled="discountApplying || !discountCode.trim()" @click="onApplyDiscount">{{ discountApplying ? messages.productCheckout.applyingDiscount : messages.productCheckout.applyDiscount }}</Button></div></div>
                <div v-if="discountPreview" class="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><div class="flex justify-between gap-4"><span class="text-muted-foreground">{{ messages.productCheckout.originalAmount }}</span><span>¥{{ discountPreview.originalAmount }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">{{ t(messages.productCheckout.appliedDiscount, { code: discountPreview.code }) }}</span><span class="text-destructive">-¥{{ discountPreview.discountAmount }}</span></div><div class="flex justify-between gap-4 border-t pt-2 font-medium"><span>{{ messages.productCheckout.amountDue }}</span><span>¥{{ discountPreview.finalAmount }}</span></div></div>
                <label class="grid gap-2 text-sm font-medium">{{ messages.productCheckout.buyerNote }}<Textarea v-model="buyerNote" rows="3" /></label>
              </CardContent><CardFooter class="flex-col items-stretch gap-3"><Button type="submit" :disabled="loading || isOutOfStock || (requiresPayment && !methods.length)">{{ loading ? messages.productCheckout.processingOrder : isOutOfStock ? messages.storefront.outOfStock : requiresPayment ? messages.productCheckout.submitAndPay : messages.productCheckout.createFreeOrder }}</Button><p class="text-xs text-muted-foreground">{{ messages.productCheckout.paymentAmountNotice }}</p></CardFooter>
            </form>
          </Card>
        </aside>
      </section>

      <StorefrontFooter />
    </div>

    <Dialog :open="Boolean(previewImage)" @update:open="(open) => { if (!open) previewImage = null; }">
      <DialogContent :show-close-button="false" class="w-fit! max-w-[calc(100vw-2rem)]! border-0 bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)]!" @interact-outside="previewImage = null">
        <DialogTitle class="sr-only">{{ messages.productCheckout.imagePreview }}</DialogTitle>
        <div class="relative inline-flex">
          <img v-if="previewImage" :src="previewImage.src" :alt="previewImage.alt" class="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain sm:max-w-[calc(100vw-4rem)]" />
          <DialogClose as-child><Button type="button" variant="ghost" size="icon" class="absolute right-2 top-2 size-10 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white" :aria-label="messages.productCheckout.closeImagePreview"><XIcon /></Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog :open="clearAddressesDialogOpen" @update:open="(open) => { clearAddressesDialogOpen = open; if (!open) selectedAddress = previousAddressSelection; }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ messages.productCheckout.confirmClearAddressesTitle }}</DialogTitle>
          <DialogDescription>{{ messages.productCheckout.confirmClearAddressesDescription }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" @click="clearAddressesDialogOpen = false">{{ messages.productCheckout.cancel }}</Button>
          <Button type="button" variant="destructive" @click="confirmClearSavedAddresses">{{ messages.productCheckout.confirmClearAddresses }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>
<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { z } from "zod";
import { XIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";

import PublicNav from "@/components/storefront/PublicNav.vue";
import StorefrontBrand from "@/components/storefront/StorefrontBrand.vue";
import StorefrontFooter from "@/components/storefront/StorefrontFooter.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import defaultProductImage from "@/assets/product_img.jpg?url";
import { clearLocalAddresses, getLocalAddresses, saveLocalAddress, type LocalAddress } from "@/lib/local-addresses";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";
import { saveGuestOrder } from "@/lib/local-orders";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onCreateAddress, onListAddresses } from "@/server/address/index.telefunc";
import { onPreviewDiscount } from "@/server/discount/preview.telefunc";
import { onCreatePayment } from "@/server/payment/checkout.telefunc";
import type { PaymentChannel, PaymentProviderKind } from "@/server/payment/registry";
import type { Data } from "./+data.server";
const { messages, t } = useStorefrontPreferences();
const data = useData<Data>();
const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user?: { id: string; email?: string | null } | null };
const user = pageContext.user ?? null;
type Address = Awaited<ReturnType<typeof onListAddresses>>[number];
type SavedAddress = Address | LocalAddress;
type AddressForm = { recipientName: string; phone: string; country: string; province: string; city: string; district: string; addressLine: string; postalCode: string };
type PaymentMethod = { key: string; provider: PaymentProviderKind; channel?: PaymentChannel; name: string };
const methods = computed<PaymentMethod[]>(() => data.paymentProviders.flatMap((provider): PaymentMethod[] => provider.channels.length ? provider.channels.map((channel) => ({ key: `${provider.provider}:${channel}`, provider: provider.provider, channel, name: provider.name })) : [{ key: `${provider.provider}:`, provider: provider.provider, name: provider.name }]));
const purchaseNote = computed(() => data.purchaseNote || messages.value.productCheckout.defaultPurchaseNote);
const deliveryHint = computed(() => {
  if (data.deliveryType === "MANUAL") return data.manualDeliveryHint || messages.value.productCheckout.defaultManualDeliveryHint;
  if (data.deliveryType === "EXPRESS") return data.manualDeliveryHint || messages.value.productCheckout.defaultExpressDeliveryHint;
  return null;
});
const descriptionRef = ref<HTMLElement | null>(null); const previewImage = ref<{ src: string; alt: string } | null>(null);
const selectedMethod = ref(methods.value[0]?.key ?? ""); const quantity = ref(data.minBuy); const contactValue = ref(user?.email?.trim() ?? ""); const discountCode = ref(""); const buyerNote = ref(""); const discountApplying = ref(false); type DiscountPreview = Awaited<ReturnType<typeof onPreviewDiscount>>; const discountPreview = ref<DiscountPreview | null>(null); const loading = ref(false);
const addresses = ref<SavedAddress[]>([]); const addressesLoading = ref(false); const selectedAddress = ref("new"); const previousAddressSelection = ref("new"); const clearAddressesDialogOpen = ref(false); const savingAddress = ref(false);
const addressSchema = z.object({ recipientName: z.string().trim().min(1, messages.value.productCheckout.validation.recipientNameRequired).max(100), phone: z.string().trim().regex(/^[0-9+()\-\s]{5,32}$/, messages.value.productCheckout.validation.phoneInvalid), country: z.string().trim().min(1, messages.value.productCheckout.validation.countryRequired).max(100), province: z.string().trim().min(1, messages.value.productCheckout.validation.provinceRequired).max(100), city: z.string().trim().min(1, messages.value.productCheckout.validation.cityRequired).max(100), district: z.string().trim().min(1, messages.value.productCheckout.validation.districtRequired).max(100), addressLine: z.string().trim().min(1, messages.value.productCheckout.validation.addressLineRequired).max(500), postalCode: z.string().trim().max(20).refine((value) => !value || /^[A-Za-z0-9][A-Za-z0-9\- ]{0,19}$/.test(value), messages.value.productCheckout.validation.postalCodeInvalid) });
const { handleSubmit, validate, values } = useForm<AddressForm>({ validationSchema: toTypedSchema(addressSchema), initialValues: { recipientName: "", phone: "", country: messages.value.productCheckout.address.defaultCountry, province: "", city: "", district: "", addressLine: "", postalCode: "" }, keepValuesOnUnmount: true });
const addressFields = computed(() => [{ name: "recipientName", label: messages.value.productCheckout.address.recipientName, autocomplete: "name", required: true }, { name: "phone", label: messages.value.productCheckout.address.phone, autocomplete: "tel", required: true }, { name: "country", label: messages.value.productCheckout.address.country, autocomplete: "country-name", required: true }, { name: "province", label: messages.value.productCheckout.address.province, autocomplete: "address-level1", required: true }, { name: "city", label: messages.value.productCheckout.address.city, autocomplete: "address-level2", required: true }, { name: "district", label: messages.value.productCheckout.address.district, autocomplete: "address-level3", required: true }, { name: "addressLine", label: messages.value.productCheckout.address.addressLine, autocomplete: "street-address", required: true, wide: true }, { name: "postalCode", label: messages.value.productCheckout.address.postalCode, autocomplete: "postal-code", required: false }] as const);
const addressFieldsWithoutPostalCode = computed(() => addressFields.value.filter((field) => field.name !== "postalCode"));
const requiresPayment = computed(() => (discountPreview.value?.finalAmount ?? data.price) !== "0.00");
const isStockLimited = computed(() => data.availableStock !== null);
const availableStock = computed(() => data.availableStock ?? 0);
const purchaseLimit = computed(() => isStockLimited.value ? Math.max(data.minBuy, Math.min(data.maxBuy, availableStock.value)) : data.maxBuy);
const isOutOfStock = computed(() => isStockLimited.value && availableStock.value < data.minBuy);
watch([discountCode, quantity], () => { discountPreview.value = null; });
function previewDescriptionImage(event: MouseEvent) { const image = event.target instanceof HTMLImageElement ? event.target : null; if (image && descriptionRef.value?.contains(image)) previewImage.value = { src: image.currentSrc || image.src, alt: image.alt || data.name }; }
async function onApplyDiscount() { const code = discountCode.value; if (!code.trim()) return; const requestedQuantity = quantity.value; discountPreview.value = null; discountApplying.value = true; try { const preview = await runTelefunc(() => onPreviewDiscount({ productId: data.id, quantity: requestedQuantity, discountCode: code }), { notifyError: false }); if (discountCode.value === code && quantity.value === requestedQuantity) discountPreview.value = preview; } catch (cause) { if (discountCode.value === code && quantity.value === requestedQuantity) toast.error(userErrorMessage(cause, messages.value.productCheckout.discountPreviewFailed)); } finally { discountApplying.value = false; } }
async function onSubmit(address: AddressForm) { if (isOutOfStock.value || (isStockLimited.value && quantity.value > availableStock.value)) { toast.error(messages.value.productCheckout.insufficientStock); return; } if (discountCode.value.trim() && !discountPreview.value) { toast.info(messages.value.productCheckout.applyDiscountFirst); return; } const method = methods.value.find((item) => item.key === selectedMethod.value); if (!method && requiresPayment.value) { toast.error(messages.value.productCheckout.noPaymentMethod); return; } const savedAddress = addresses.value.find((item) => String(item.id) === selectedAddress.value); const useStoredAddress = data.deliveryType === "EXPRESS" && selectedAddress.value !== "new" && savedAddress; const expressAddress = data.deliveryType === "EXPRESS" ? (useStoredAddress ? (user ? { addressId: Number(savedAddress.id) } : { address: { recipientName: savedAddress.recipientName, phone: savedAddress.phone, country: savedAddress.country, province: savedAddress.province, city: savedAddress.city, district: savedAddress.district, addressLine: savedAddress.addressLine, postalCode: savedAddress.postalCode || undefined } }) : { address: { ...address, postalCode: address.postalCode || undefined } }) : {}; loading.value = true; try { const created = await runTelefunc(() => onCreatePayment({ productId: data.id, quantity: quantity.value, paymentProvider: method?.provider ?? "ALIPAY", paymentChannel: method?.channel, contactType: "EMAIL", contactValue: contactValue.value, ...expressAddress, discountCode: discountPreview.value?.code, buyerNote: buyerNote.value }), { notifyError: false }); if (!pageContext.user) saveGuestOrder(contactValue.value, { orderNo: created.orderNo, productName: data.name, amount: requiresPayment.value ? (discountPreview.value?.finalAmount ?? data.price) : "0.00", createdAt: new Date().toISOString() }); if (created.payment?.mode === "redirect" && created.payment.url) { window.location.assign(created.payment.url); return; } if (created.payment?.mode === "qr") { window.location.assign(`/checkout?orderNo=${encodeURIComponent(created.orderNo)}`); return; } window.location.assign(`${pageContext.user ? "/account/order" : "/order"}?orderNo=${encodeURIComponent(created.orderNo)}`); } catch (cause) { toast.error(userErrorMessage(cause, messages.value.productCheckout.orderSubmissionFailed)); } finally { loading.value = false; } }
const submitAddress = handleSubmit(onSubmit, () => toast.error(messages.value.productCheckout.shippingAddressIncomplete));
function submit(event: Event) {
  const requiresAddressForm = data.deliveryType === "EXPRESS" && (!user || selectedAddress.value === "new" || !addresses.value.length);
  if (requiresAddressForm) return submitAddress(event);
  void onSubmit({ recipientName: "", phone: "", country: "", province: "", city: "", district: "", addressLine: "", postalCode: "" });
}
async function saveCurrentAddress() { const result = await validate(); if (!result.valid) { toast.error(messages.value.productCheckout.shippingAddressIncomplete); return; } savingAddress.value = true; try { const input = { ...values, postalCode: values.postalCode || undefined, isDefault: addresses.value.length === 0 }; const saved = user ? await runTelefunc(() => onCreateAddress(input), { notifyError: false }) : saveLocalAddress({ ...input, postalCode: input.postalCode ?? null }); if (!saved) { toast.error(messages.value.productCheckout.addressSaveStorageFailed); return; } addresses.value = [...addresses.value, saved]; selectedAddress.value = String(saved.id); toast.success(messages.value.productCheckout.addressSaved); } catch (cause) { toast.error(userErrorMessage(cause, messages.value.productCheckout.addressSaveFailed)); } finally { savingAddress.value = false; } }
function onAddressSelectionChange(value: unknown) { if (value === "clear-local-addresses") { previousAddressSelection.value = selectedAddress.value; clearAddressesDialogOpen.value = true; return; } if (typeof value === "string") selectedAddress.value = value; }
function confirmClearSavedAddresses() { if (!clearLocalAddresses()) { toast.error(messages.value.productCheckout.clearAddressesFailed); return; } addresses.value = []; selectedAddress.value = "new"; clearAddressesDialogOpen.value = false; toast.success(messages.value.productCheckout.addressesCleared); }
async function loadAddresses() { if (data.deliveryType !== "EXPRESS") return; addressesLoading.value = true; try { addresses.value = user ? await runTelefunc(() => onListAddresses(), { notifyError: false }) : getLocalAddresses(); const preferred = addresses.value.find((item) => item.isDefault) ?? addresses.value[0]; selectedAddress.value = preferred ? String(preferred.id) : "new"; } catch (cause) { toast.error(userErrorMessage(cause, messages.value.productCheckout.addressLoadFailed)); selectedAddress.value = "new"; } finally { addressesLoading.value = false; } }
function addressSummary(address: SavedAddress) { return `${address.province}${address.city}${address.district}${address.addressLine}`; }
onMounted(loadAddresses);
function channelLabel(channel: string) { return ({ web: messages.value.productCheckout.paymentChannels.web, wap: messages.value.productCheckout.paymentChannels.wap, face_to_face: messages.value.productCheckout.paymentChannels.faceToFace, alipay: messages.value.productCheckout.paymentChannels.alipay, wxpay: messages.value.productCheckout.paymentChannels.wxpay } as Record<string, string>)[channel] ?? channel; }
</script>
