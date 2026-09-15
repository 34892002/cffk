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
          <CardTitle>订单支付</CardTitle>
          <CardDescription>{{ order ? `订单号：${order.orderNo}` : "正在确认订单信息..." }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-6">
          <Alert v-if="error" variant="destructive"><AlertTitle>无法继续支付</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
          <template v-else-if="order">
            <dl class="grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-3">
              <div><dt class="text-xs text-muted-foreground">商品</dt><dd class="mt-1 font-medium">{{ order.productName }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">订单金额</dt><dd class="mt-1 font-medium">¥{{ order.amount }}</dd></div>
              <div v-if="payableAmount !== null"><dt class="text-xs text-muted-foreground">扫码支付</dt><dd class="mt-1 font-medium">¥{{ formatCentsAsYuan(payableAmount) }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">支付状态</dt><dd class="mt-1 font-medium">{{ paymentStatusLabel(order.paymentStatus) }}</dd></div>
            </dl>
            <div v-if="order.paymentStatus === 'UNPAID'" class="grid justify-items-center gap-4 border-t pt-6 text-center">
              <template v-if="isQrPaymentOrder(order)">
                <div v-if="isPerpayQrPaymentOrder(order) && payableAmount !== null" class="w-full rounded-xl border-2 border-primary/35 px-5 py-4 text-center shadow-sm" aria-live="polite">
                  <p class="mt-1 text-4xl font-bold tracking-tight text-primary sm:text-5xl"><span class="text-2xl sm:text-3xl">¥</span>{{ formatCentsAsYuan(payableAmount) }}</p>
                  <p class="mt-3 text-sm font-medium leading-6 text-foreground">请按此金额付款，金额必须完全一致</p>
                </div>
                <p class="font-medium">请使用支付宝扫码付款</p>
                <div class="w-full max-w-72"><PaymentQrCode v-if="qrCode" :value="qrCode" /><p v-else class="py-16 text-sm text-muted-foreground">正在准备收款二维码...</p></div>
                <p class="text-xs text-muted-foreground">支付完成后，页面会自动更新订单状态。</p>
              </template>
              <p v-else class="text-sm text-muted-foreground">该订单不使用站内扫码支付，请返回订单页面继续支付。</p>
            </div>
            <Alert v-else><AlertTitle>{{ order.paymentStatus === "PAID" ? "支付成功" : "订单已结束" }}</AlertTitle><AlertDescription>{{ order.paymentStatus === "PAID" ? "支付已确认，可返回订单查看发货进度。" : "该订单当前无法继续支付。" }}</AlertDescription></Alert>
          </template>
          <p v-else class="py-16 text-center text-sm text-muted-foreground">正在加载订单...</p>
        </CardContent>
        <CardFooter v-if="order" class="justify-end gap-3 border-t pt-5">
          <Button v-if="order.paymentStatus === 'UNPAID' && isQrPaymentOrder(order)" variant="outline" :disabled="resuming" @click="resumePayment">{{ resuming ? "正在生成..." : "重新生成二维码" }}</Button>
          <Button as-child><a :href="orderHref">查看订单</a></Button>
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
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onQueryOrder, onResumeOrderPayment, type PublicOrder } from "@/server/order/public.telefunc";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user?: { id: string } | null };
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
  if (!orderNo) { error.value = "缺少订单号，请返回订单页面重新选择订单。"; return; }
  guestEmail.value = Object.entries(getLocalOrderGroups()).find(([, orders]) => orders.some(item => item.orderNo === orderNo))?.[0];
  if (!guestEmail.value && !pageContext.user) { error.value = "未找到本机订单，请返回订单页面使用订单号和下单邮箱查询。"; return; }
  void loadOrder();
});
onBeforeUnmount(stopPolling);

function queryInput() { return { orderNo, ...(guestEmail.value ? { email: guestEmail.value } : {}) }; }
async function loadOrder() {
  try {
    const record = await runTelefunc(() => onQueryOrder(queryInput()), { notifyError: false });
    if (!record) { error.value = guestEmail.value ? "订单不存在，或下单邮箱不匹配。" : "未找到当前账户下的该订单。"; return; }
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
    error.value = "暂时无法生成支付二维码，请稍后再试。";
  } catch (cause) { error.value = userErrorMessage(cause, "暂时无法生成支付二维码，请稍后再试。"); } finally { resuming.value = false; }
}
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function isQrPaymentOrder(record: PublicOrder) { return record.paymentProvider === "PERPAY" || (record.paymentProvider === "ALIPAY" && record.paymentChannel === "face_to_face"); }
function isPerpayQrPaymentOrder(record: PublicOrder) { return record.paymentProvider === "PERPAY"; }
</script>
