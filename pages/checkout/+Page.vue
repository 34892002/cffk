<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-2xl items-center justify-between px-5">
        <StorefrontBrand />
        <PublicNav />
      </div>
    </header>

    <section class="mx-auto max-w-2xl px-5 pb-12 pt-26">
      <Card>
        <CardHeader>
          <CardTitle>{{ messages.checkout.title }}</CardTitle>
          <CardDescription>{{ order ? t(messages.checkout.orderNumber, { orderNo: order.orderNo }) : messages.checkout.confirming }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-6">
          <Alert v-if="error" variant="destructive"><AlertTitle>{{ messages.checkout.notPayableTitle }}</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
          <template v-else-if="order">
            <dl class="grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-3">
              <div><dt class="text-xs text-muted-foreground">{{ messages.checkout.product }}</dt><dd class="mt-1 font-medium">{{ order.productName }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">{{ messages.checkout.orderAmount }}</dt><dd class="mt-1 font-medium">¥{{ order.amount }}<CurrencyHint v-if="payableAmount === null" /></dd></div>
              <div v-if="payableAmount !== null"><dt class="text-xs text-muted-foreground">{{ messages.checkout.scanPayment }}</dt><dd class="mt-1 font-medium">¥{{ formatCentsAsYuan(payableAmount) }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">{{ messages.checkout.paymentStatusLabel }}</dt><dd class="mt-1 font-medium">{{ paymentStatusLabel(order.paymentStatus) }}</dd></div>
            </dl>
            <div v-if="order.paymentStatus === 'UNPAID'" class="grid justify-items-center gap-4 border-t pt-6 text-center">
              <template v-if="isQrPaymentOrder(order)">
                <div v-if="isPerpayQrPaymentOrder(order) && payableAmount !== null" class="w-full rounded-xl border-2 border-primary/35 px-5 py-4 text-center shadow-sm" aria-live="polite">
                  <p class="mt-1 text-4xl font-bold tracking-tight text-primary sm:text-5xl"><span class="text-2xl sm:text-3xl">¥</span>{{ formatCentsAsYuan(payableAmount) }}<CurrencyHint /></p>
                  <p class="mt-3 text-sm font-medium leading-6 text-foreground">{{ messages.checkout.exactAmountNotice }}</p>
                </div>
                <p class="font-medium">{{ messages.checkout.scanWithAlipay }}</p>
                <div class="w-full max-w-72"><PaymentQrCode v-if="qrCode" :value="qrCode" /><p v-else class="py-16 text-sm text-muted-foreground">{{ messages.checkout.preparingQrCode }}</p></div>
                <p class="text-xs text-muted-foreground">{{ messages.checkout.autoRefreshNotice }}</p>
              </template>
              <p v-else class="text-sm text-muted-foreground">{{ messages.checkout.notQrPayment }}</p>
            </div>
            <Alert v-else><AlertTitle>{{ order.paymentStatus === "PAID" ? messages.checkout.paidTitle : messages.checkout.closedTitle }}</AlertTitle><AlertDescription>{{ order.paymentStatus === "PAID" ? messages.checkout.paidDescription : messages.checkout.closedDescription }}</AlertDescription></Alert>
          </template>
          <p v-else class="py-16 text-center text-sm text-muted-foreground">{{ messages.checkout.loading }}</p>
        </CardContent>
        <CardFooter v-if="order" class="justify-end gap-3 border-t pt-5">
          <Button v-if="order.paymentStatus === 'UNPAID' && isQrPaymentOrder(order)" variant="outline" :disabled="resuming" @click="resumePayment">{{ resuming ? messages.checkout.regenerating : messages.checkout.regenerateQrCode }}</Button>
          <Button as-child><a :href="orderHref">{{ messages.checkout.viewOrder }}</a></Button>
        </CardFooter>
      </Card>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import PaymentQrCode from "@/components/PaymentQrCode.vue";
import PublicNav from "@/components/storefront/PublicNav.vue";
import StorefrontBrand from "@/components/storefront/StorefrontBrand.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { getLocalOrderGroups } from "@/lib/local-orders";
import CurrencyHint from "@/components/storefront/CurrencyHint.vue";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onQueryOrder, onResumeOrderPayment, type PublicOrder } from "@/server/order/public.telefunc";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user?: { id: string } | null };
const { messages, t } = useStorefrontPreferences();
const rawOrderNo = pageContext.urlParsed.search.orderNo;
const orderNo = (typeof rawOrderNo === "string" ? rawOrderNo : "").trim();
const guestEmail = ref<string | undefined>();
const order = ref<PublicOrder | null>(null);
const qrCode = ref("");
const payableAmount = ref<number | null>(null);
const error = ref<string | null>(null);
const resuming = ref(false);
const orderHref = computed(() => `${guestEmail.value ? "/order" : "/account/order"}${orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : ""}`);
let pollTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (!orderNo) { error.value = messages.value.checkout.errors.missingOrderNumber; return; }
  guestEmail.value = Object.entries(getLocalOrderGroups()).find(([, orders]) => orders.some(item => item.orderNo === orderNo))?.[0];
  if (!guestEmail.value && !pageContext.user) { error.value = messages.value.checkout.errors.localOrderNotFound; return; }
  void loadOrder();
});
onBeforeUnmount(stopPolling);

function queryInput() { return { orderNo, ...(guestEmail.value ? { email: guestEmail.value } : {}) }; }
async function loadOrder() {
  try {
    const record = await runTelefunc(() => onQueryOrder(queryInput()), { notifyError: false });
    if (!record) { error.value = guestEmail.value ? messages.value.checkout.errors.orderNotFound : messages.value.checkout.errors.accountOrderNotFound; return; }
    order.value = record;
    if (record.paymentStatus === "UNPAID" && isQrPaymentOrder(record)) {
      try { qrCode.value = sessionStorage.getItem(`payment-qr:${record.orderNo}`) ?? ""; } catch { qrCode.value = ""; }
      try { const stored = Number(sessionStorage.getItem(`payment-payable:${record.orderNo}`)); payableAmount.value = Number.isSafeInteger(stored) && stored > 0 ? stored : null; } catch { payableAmount.value = null; }
      if (!qrCode.value) await resumePayment();
      startPolling();
    }
  } catch (cause) { error.value = userErrorMessage(cause); }
}
function startPolling() { stopPolling(); pollTimer = setInterval(() => { void refreshOrder(); }, 5000); }
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; } }
async function refreshOrder() {
  if (!order.value || order.value.paymentStatus !== "UNPAID") return;
  try {
    const record = await runTelefunc(() => onQueryOrder(queryInput()), { notifyError: false });
    if (!record) return;
    order.value = record;
    if (record.paymentStatus !== "UNPAID") { stopPolling(); qrCode.value = ""; payableAmount.value = null; try { sessionStorage.removeItem(`payment-qr:${record.orderNo}`); sessionStorage.removeItem(`payment-payable:${record.orderNo}`); } catch { /* Session storage is optional. */ } }
  } catch { /* The next poll retries. */ }
}
async function resumePayment() {
  if (!order.value || resuming.value) return;
  resuming.value = true;
  try {
    const payment = await runTelefunc(() => onResumeOrderPayment(queryInput()), { notifyError: false });
    if (payment.payment?.mode === "qr" && payment.payment.qrCode) { qrCode.value = payment.payment.qrCode; payableAmount.value = payment.payment.payableAmount ?? null; try { sessionStorage.setItem(`payment-qr:${payment.orderNo}`, payment.payment.qrCode); if (payment.payment.payableAmount) sessionStorage.setItem(`payment-payable:${payment.orderNo}`, String(payment.payment.payableAmount)); } catch { /* Session storage is optional. */ } return; }
    error.value = messages.value.checkout.errors.qrCodeFailed;
  } catch (cause) { error.value = userErrorMessage(cause, messages.value.checkout.errors.qrCodeFailed); } finally { resuming.value = false; }
}
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: messages.value.checkout.paymentStatus.unpaid, PAID: messages.value.checkout.paymentStatus.paid, FAILED: messages.value.checkout.paymentStatus.failed }[status]; }
function isQrPaymentOrder(record: PublicOrder) { return record.paymentProvider === "PERPAY" || (record.paymentProvider === "ALIPAY" && record.paymentChannel === "face_to_face"); }
function isPerpayQrPaymentOrder(record: PublicOrder) { return record.paymentProvider === "PERPAY"; }
</script>
