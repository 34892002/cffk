<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Button variant="ghost" size="sm" as-child><a href="/"><ArrowLeftIcon />返回商品列表</a></Button>
        <Button variant="ghost" size="sm" as-child><a href="/">首页</a></Button>
      </div>
    </header>

    <section class="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6 sm:pb-16 sm:pt-28">
      <div class="mb-6">
        <h1 class="text-2xl font-semibold">我的订单</h1>
        <p class="mt-1 text-sm text-muted-foreground">查看本机保存的订单，或使用订单凭证查询。</p>
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside class="grid gap-6 lg:order-1" :class="result ? 'order-2' : 'order-1'">
          <section v-if="localOrders.length" class="order-2" aria-labelledby="recent-orders-title">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h2 id="recent-orders-title" class="text-sm font-semibold">本机订单</h2>
              <Badge variant="outline">{{ localOrders.length }}</Badge>
            </div>
            <div class="max-h-80 space-y-2 overflow-y-auto pr-1 lg:max-h-112">
              <button
                v-for="item in localOrders"
                :key="item.orderNo"
                type="button"
                class="grid w-full gap-1 rounded-md border bg-background px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="item.orderNo === result?.orderNo ? 'border-foreground/30 bg-muted/60' : ''"
                @click="openLocalOrder(item)"
              >
                <span class="truncate text-sm font-medium">{{ item.productName }}</span>
                <span class="break-all font-mono text-[11px] leading-4 text-muted-foreground">{{ item.orderNo }}</span>
              </button>
            </div>
          </section>

          <Card class="order-1">
            <CardHeader class="pb-4">
              <CardTitle class="flex items-center gap-2 text-base"><SearchIcon class="size-4" />查询订单</CardTitle>
            </CardHeader>
            <form @submit.prevent="onSubmit">
              <CardContent class="grid gap-4">
                <label class="grid gap-2 text-sm font-medium">
                  订单号
                  <Input v-model="orderNo" required autocomplete="off" placeholder="ORD..." />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  查询令牌
                  <Input v-model="queryToken" required autocomplete="off" placeholder="输入查询令牌" />
                </label>
                <Alert v-if="error" variant="destructive"><AlertTitle>查询失败</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
              </CardContent>
              <CardFooter class="pt-5">
                <Button type="submit" class="w-full" :disabled="loading"><SearchIcon />{{ loading ? "查询中..." : "查询订单" }}</Button>
              </CardFooter>
            </form>
          </Card>
        </aside>

        <section class="min-w-0 lg:order-2" :class="result ? 'order-1' : 'order-2'" aria-live="polite">
          <Card v-if="result">
            <CardHeader class="border-b">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0">
                  <CardDescription class="mb-2">订单详情</CardDescription>
                  <CardTitle class="text-xl">{{ result.productName }}</CardTitle>
                  <p class="mt-2 break-all font-mono text-xs leading-5 text-muted-foreground">{{ result.orderNo }}</p>
                </div>
                <Badge :variant="statusVariant(result.status)">{{ statusLabel(result.status) }}</Badge>
              </div>
            </CardHeader>
            <CardContent class="grid gap-6 pt-6 text-sm">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <div><dt class="text-xs text-muted-foreground">数量</dt><dd class="mt-1 font-medium">{{ result.quantity }}</dd></div>
                <div><dt class="text-xs text-muted-foreground">金额</dt><dd class="mt-1 font-medium">¥{{ result.amount }}</dd></div>
                <div><dt class="text-xs text-muted-foreground">支付状态</dt><dd class="mt-1 font-medium">{{ paymentStatusLabel(result.paymentStatus) }}</dd></div>
                <div><dt class="text-xs text-muted-foreground">发货状态</dt><dd class="mt-1 font-medium">{{ deliveryStatusLabel(result.deliveryStatus) }}</dd></div>
              </dl>

              <div v-if="isFaceToFacePayment && result.paymentStatus === 'UNPAID'" class="grid justify-items-center gap-3 border-t pt-6 text-center">
                <p class="font-medium">请使用支付宝扫码付款</p>
                <div class="w-full max-w-72"><PaymentQrCode v-if="paymentQrCode" :value="paymentQrCode" /><p v-else class="py-16 text-muted-foreground">正在生成支付二维码...</p></div>
                <p class="text-xs text-muted-foreground">支付完成后，订单状态会自动更新。</p>
              </div>

              <div v-if="result.deliveries.length" class="min-w-0 border-t pt-6">
                <p class="mb-3 font-medium">发货内容</p>
                <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-4 font-mono text-xs leading-6">{{ result.deliveries.join("\n") }}</pre>
              </div>
              <Alert v-else-if="result.paymentStatus === 'PAID'">
                <AlertTitle>等待发货</AlertTitle>
                <AlertDescription>订单已支付，发货任务正在处理中。</AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter v-if="result.paymentStatus === 'UNPAID'" class="justify-end border-t pt-5">
              <Button :disabled="resumingPayment" @click="resumePayment">{{ resumingPayment ? "正在生成支付信息..." : isFaceToFacePayment ? "重新生成二维码" : "继续支付" }}</Button>
            </CardFooter>
          </Card>

          <div v-else class="grid min-h-80 place-items-center rounded-md border border-dashed bg-background/60 p-8 text-center">
            <div class="max-w-sm">
              <SearchIcon class="mx-auto size-8 text-muted-foreground" />
              <h2 class="mt-4 font-medium">选择或查询订单</h2>
              <p class="mt-2 text-sm leading-6 text-muted-foreground">从本机订单中选择一笔，或输入订单号和查询令牌。</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowLeftIcon, SearchIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PaymentQrCode from "@/components/PaymentQrCode.vue";
import { getLocalOrders, type LocalOrder } from "@/lib/local-orders";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onQueryOrder, onResumeOrderPayment, type PublicOrder } from "@/server/order/public.telefunc";

const orderNo = ref("");
const queryToken = ref("");
const result = ref<PublicOrder | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const resumingPayment = ref(false);
const localOrders = ref<LocalOrder[]>([]);
const paymentQrCode = ref("");
const isFaceToFacePayment = computed(() => result.value?.paymentChannel === "face_to_face");
let pollTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  localOrders.value = getLocalOrders();
  const params = new URLSearchParams(window.location.search);
  orderNo.value = params.get("orderNo")?.trim() ?? "";
  queryToken.value = params.get("token")?.trim() ?? "";
  if (orderNo.value && queryToken.value) void onSubmit();
});
onBeforeUnmount(stopPolling);

async function onSubmit() {
  error.value = null;
  result.value = null;
  paymentQrCode.value = "";
  loading.value = true;
  try {
    const record = await runTelefunc(() => onQueryOrder({ orderNo: orderNo.value, queryToken: queryToken.value }), { notifyError: false });
    if (!record) error.value = "订单不存在，或查询令牌不正确。";
    else {
      result.value = record;
      if (record.paymentStatus === "UNPAID" && record.paymentChannel === "face_to_face") {
        try { paymentQrCode.value = sessionStorage.getItem(`payment-qr:${record.orderNo}`) ?? ""; } catch { paymentQrCode.value = ""; }
        if (!paymentQrCode.value) await resumePayment();
        startPolling();
      } else stopPolling();
    }
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

function openLocalOrder(item: LocalOrder) { orderNo.value = item.orderNo; queryToken.value = item.queryToken; void onSubmit(); }

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => { void refreshOrder(); }, 5000);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; } }
async function refreshOrder() {
  if (!result.value || result.value.paymentStatus !== "UNPAID") return;
  try {
    const record = await runTelefunc(() => onQueryOrder({ orderNo: orderNo.value, queryToken: queryToken.value }), { notifyError: false });
    if (!record) return;
    result.value = record;
    if (record.paymentStatus !== "UNPAID") {
      stopPolling();
      paymentQrCode.value = "";
      try { sessionStorage.removeItem(`payment-qr:${record.orderNo}`); } catch { /* Session storage is optional. */ }
    }
  } catch {
    // Polling is best effort; the next interval retries the query.
  }
}

async function resumePayment() {
  if (!result.value || resumingPayment.value) return;
  resumingPayment.value = true;
  try {
    const payment = await runTelefunc(() => onResumeOrderPayment({ orderNo: orderNo.value, queryToken: queryToken.value }), { notifyError: false });
    if (payment.payment?.mode === "redirect" && payment.payment.url) { window.location.assign(payment.payment.url); return; }
    if (payment.payment?.mode === "qr" && payment.payment.qrCode) { paymentQrCode.value = payment.payment.qrCode; try { sessionStorage.setItem(`payment-qr:${payment.orderNo}`, payment.payment.qrCode); } catch { /* Session storage is optional. */ } startPolling(); return; }
    toast.error("暂时无法生成支付信息，请稍后再试。");
  } catch (cause) {
    toast.error(userErrorMessage(cause, "暂时无法继续支付，请稍后再试。"));
  } finally {
    resumingPayment.value = false;
  }
}

function statusLabel(status: PublicOrder["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已发货", CLOSED: "已关闭", FAILED: "失败" }[status]; }
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function deliveryStatusLabel(status: PublicOrder["deliveryStatus"]) { return { NOT_DELIVERED: "未发货", DELIVERING: "发货中", DELIVERED: "已发货", FAILED: "发货失败" }[status]; }
function statusVariant(status: PublicOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
