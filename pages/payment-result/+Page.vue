<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-2xl items-center justify-between px-5">
        <StorefrontBrand />
        <PublicNav />
      </div>
    </header>
    <section class="mx-auto max-w-2xl px-5 pb-10 pt-26">
      <Card>
        <CardHeader>
          <CardTitle>{{ order ? messages.paymentResult.title : messages.paymentResult.confirmingTitle }}</CardTitle>
          <CardDescription>{{ order ? order.productName : messages.paymentResult.descriptionFallback }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4 text-sm">
          <Alert v-if="message" :variant="error ? 'destructive' : 'default'">
            <AlertTitle>{{ error ? messages.paymentResult.queryFailedTitle : messages.paymentResult.missingInfoTitle }}</AlertTitle>
            <AlertDescription>{{ message }}</AlertDescription>
          </Alert>
          <template v-if="order">
            <div class="flex items-center justify-between gap-4 rounded-md border p-4"><span>{{ messages.paymentResult.orderStatus }}</span><Badge :variant="statusVariant(order.status)">{{ statusLabel(order.status) }}</Badge></div>
            <div class="grid gap-3 border-y py-4"><div class="flex justify-between gap-4"><span class="text-muted-foreground">{{ messages.paymentResult.orderNumber }}</span><span class="font-mono text-xs">{{ order.orderNo }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">{{ messages.paymentResult.amount }}</span><span>¥{{ order.amount }}<CurrencyHint /></span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">{{ messages.paymentResult.paymentStatusLabel }}</span><span>{{ paymentStatusLabel(order.paymentStatus) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">{{ messages.paymentResult.deliveryStatusLabel }}</span><span>{{ deliveryStatusLabel(order.deliveryStatus) }}</span></div></div>
            <div v-if="order.deliveries.length"><p class="font-medium">{{ messages.paymentResult.deliveryContents }}</p><pre class="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-6">{{ order.deliveries.join("\n") }}</pre></div>
            <p v-else class="text-muted-foreground">{{ messages.paymentResult.pendingDelivery }}</p>
          </template>
        </CardContent>
        <CardFooter class="flex justify-between gap-3">
          <a :href="orderPageHref" class="text-sm font-medium hover:text-muted-foreground">{{ messages.paymentResult.openOrderLookup }}</a>
          <Button v-if="order?.paymentStatus === 'UNPAID'" variant="outline" size="sm" :disabled="refreshing" @click="refreshOrder">{{ refreshing ? messages.paymentResult.refreshing : messages.paymentResult.refresh }}</Button>
        </CardFooter>
      </Card>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";
import PublicNav from "@/components/storefront/PublicNav.vue";
import StorefrontBrand from "@/components/storefront/StorefrontBrand.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocalOrderGroups } from "@/lib/local-orders";
import CurrencyHint from "@/components/storefront/CurrencyHint.vue";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onQueryOrder, type PublicOrder } from "@/server/order/public.telefunc";
import type { Data } from "./+data.server";

type PublicUser = { id: string };

const data = useData<Data>();
const { messages } = useStorefrontPreferences();
const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user?: PublicUser | null };
const order = ref<PublicOrder | null>(null);
const refreshing = ref(false);
const error = ref<string | null>(null);
const email = ref<string | undefined>();
const orderPageHref = computed(() => data.orderNo ? `/order?orderNo=${encodeURIComponent(data.orderNo)}` : "/order");
const message = computed(() => {
  if (error.value) return error.value;
  if (!data.orderNo) return messages.value.paymentResult.hints.missingOrderNumber;
  if (!pageContext.user && !email.value) return messages.value.paymentResult.hints.guestOrderNotFound;
  if (!order.value && !refreshing.value) return messages.value.paymentResult.hints.confirming;
  return null;
});
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (!data.orderNo) return;
  if (!pageContext.user) {
    const groups = getLocalOrderGroups();
    email.value = Object.entries(groups).find(([, orders]) => orders.some((item) => item.orderNo === data.orderNo))?.[0];
    if (!email.value) return;
  }
  void refreshOrder();
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

async function refreshOrder() {
  if (!data.orderNo || (!pageContext.user && !email.value) || refreshing.value) return;
  refreshing.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onQueryOrder({ orderNo: data.orderNo, ...(email.value ? { email: email.value } : {}) }), { notifyError: false });
    if (!result) {
      error.value = pageContext.user ? messages.value.paymentResult.hints.accountOrderNotFound : messages.value.paymentResult.hints.orderNotFound;
      return;
    }
    order.value = result;
    if (result.paymentStatus === "UNPAID" && !timer) timer = setInterval(() => { void refreshOrder(); }, 5000);
    if (result.paymentStatus !== "UNPAID" && timer) { clearInterval(timer); timer = undefined; }
  } catch (cause) {
    error.value = userErrorMessage(cause, messages.value.paymentResult.hints.refreshFailed);
  } finally {
    refreshing.value = false;
  }
}

function statusLabel(status: PublicOrder["status"]) { return { PENDING: messages.value.paymentResult.status.pending, PAID: messages.value.paymentResult.status.paid, DELIVERED: messages.value.paymentResult.status.delivered, CLOSED: messages.value.paymentResult.status.closed, FAILED: messages.value.paymentResult.status.failed }[status]; }
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: messages.value.paymentResult.paymentStatus.unpaid, PAID: messages.value.paymentResult.paymentStatus.paid, FAILED: messages.value.paymentResult.paymentStatus.failed }[status]; }
function deliveryStatusLabel(status: PublicOrder["deliveryStatus"]) { return { NOT_DELIVERED: messages.value.paymentResult.deliveryStatus.notDelivered, DELIVERING: messages.value.paymentResult.deliveryStatus.delivering, DELIVERED: messages.value.paymentResult.deliveryStatus.delivered, FAILED: messages.value.paymentResult.deliveryStatus.failed }[status]; }
function statusVariant(status: PublicOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
