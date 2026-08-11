<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-md items-center justify-between px-5">
        <Button variant="ghost" size="sm" as-child><a href="/"><ArrowLeftIcon />返回商品列表</a></Button>
        <Button variant="ghost" size="sm" as-child><a href="/">首页</a></Button>
      </div>
    </header>

    <section class="mx-auto max-w-md px-5 pb-12 pt-28 sm:pb-16 sm:pt-32">
      <Card>
        <CardHeader>
          <CardTitle>查询订单</CardTitle>
          <CardDescription>请输入下单后保存的订单号和查询令牌。</CardDescription>
        </CardHeader>
        <form class="grid gap-6" @submit.prevent="onSubmit">
          <CardContent class="grid gap-4">
            <div v-if="localOrders.length" class="grid gap-2"><p class="text-sm font-medium">本机订单</p><div class="grid gap-2"><Button v-for="item in localOrders" :key="item.orderNo" type="button" variant="outline" class="h-auto justify-start px-3 py-2 text-left" @click="openLocalOrder(item)"><span class="grid gap-1"><span class="font-medium">{{ item.productName }}</span><span class="font-mono text-xs text-muted-foreground">{{ item.orderNo }}</span></span></Button></div></div>
            <label class="grid gap-2 text-sm font-medium">
              订单号
              <Input v-model="orderNo" required autocomplete="off" placeholder="例如：ORD-20260807-XXXX" />
            </label>
            <label class="grid gap-2 text-sm font-medium">
              查询令牌
              <Input v-model="queryToken" required autocomplete="off" placeholder="下单后获得的查询令牌" />
            </label>
            <Alert v-if="error" variant="destructive"><AlertTitle>查询失败</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
          </CardContent>
          <CardFooter class="flex-col items-stretch gap-3">
            <Button type="submit" :disabled="loading">{{ loading ? "查询中..." : "查询订单" }}</Button>
            <p class="text-xs leading-5 text-muted-foreground">订单号和查询令牌仅用于查询该笔订单。</p>
          </CardFooter>
        </form>
      </Card>

      <Card v-if="result" class="mt-6">
        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle>{{ result.productName }}</CardTitle><CardDescription class="mt-1 font-mono">{{ result.orderNo }}</CardDescription></div>
            <Badge :variant="statusVariant(result.status)">{{ statusLabel(result.status) }}</Badge>
          </div>
        </CardHeader>
        <CardContent class="grid gap-4 text-sm">
          <div class="grid gap-2 border-y py-4"><div class="flex justify-between gap-4"><span class="text-muted-foreground">数量</span><span>{{ result.quantity }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">金额</span><span>¥{{ result.amount }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">支付状态</span><span>{{ paymentStatusLabel(result.paymentStatus) }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">交付状态</span><span>{{ deliveryStatusLabel(result.deliveryStatus) }}</span></div></div>
          <div v-if="isFaceToFacePayment && result.paymentStatus === 'UNPAID'" class="grid gap-3"><p class="font-medium">请使用支付宝扫码付款</p><PaymentQrCode v-if="paymentQrCode" :value="paymentQrCode" /><p v-else class="text-muted-foreground">正在生成支付二维码...</p><p class="text-xs text-muted-foreground">支付完成后，订单状态会自动更新。</p></div>
          <div v-if="result.deliveries.length"><p class="font-medium">交付内容</p><pre class="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-6">{{ result.deliveries.join("\n") }}</pre></div>
          <p v-else-if="result.paymentStatus === 'PAID'" class="text-muted-foreground">订单已支付，正在等待交付处理。</p>
        </CardContent>
        <CardFooter v-if="result?.paymentStatus === 'UNPAID'" class="border-t"><Button :disabled="resumingPayment" @click="resumePayment">{{ resumingPayment ? "正在生成支付信息..." : isFaceToFacePayment ? "重新生成二维码" : "继续支付" }}</Button></CardFooter>
      </Card>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowLeftIcon } from "@lucide/vue";
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

function statusLabel(status: PublicOrder["status"]) { return { PENDING: "待支付", PAID: "已支付", DELIVERED: "已交付", CLOSED: "已关闭", FAILED: "失败" }[status]; }
function paymentStatusLabel(status: PublicOrder["paymentStatus"]) { return { UNPAID: "待支付", PAID: "已支付", FAILED: "支付失败" }[status]; }
function deliveryStatusLabel(status: PublicOrder["deliveryStatus"]) { return { NOT_DELIVERED: "未交付", DELIVERING: "交付中", DELIVERED: "已交付", FAILED: "交付失败" }[status]; }
function statusVariant(status: PublicOrder["status"]) { return status === "DELIVERED" || status === "PAID" ? "secondary" : status === "FAILED" ? "destructive" : "outline"; }
</script>
