<template>
  <main class="min-h-screen bg-muted/30">
    <header class="border-b bg-background">
      <div class="mx-auto flex min-h-16 max-w-2xl items-center justify-between px-5">
        <a :href="`/product/${data.slug}`" class="text-sm font-medium hover:text-muted-foreground">返回商品</a>
        <a href="/order" class="text-sm text-muted-foreground hover:text-foreground">查询订单</a>
      </div>
    </header>

    <section class="mx-auto grid max-w-2xl gap-6 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <Card>
        <CardHeader>
          <CardTitle>确认订单</CardTitle>
          <CardDescription>{{ data.name }}</CardDescription>
        </CardHeader>
        <form @submit.prevent="onSubmit">
          <CardContent class="grid gap-4">
            <label class="grid gap-2 text-sm font-medium">购买数量
              <Input v-model.number="quantity" type="number" :min="data.minBuy" :max="data.maxBuy" required />
            </label>
            <label class="grid gap-2 text-sm font-medium">联系方式
              <Input v-model="contactValue" :required="data.isContactRequired" :placeholder="data.isContactRequired ? '用于接收订单通知' : '选填'" />
            </label>
            <label v-if="data.deliveryType === 'EXPRESS'" class="grid gap-2 text-sm font-medium">收件信息
              <Textarea v-model="receiverInfo" required rows="3" class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="姓名、电话、详细地址" />
            </label>
            <label v-if="data.paymentProviders.length" class="grid gap-2 text-sm font-medium">支付方式
              <Select v-model="paymentProvider"><SelectTrigger class="h-9"><SelectValue placeholder="选择支付方式" /></SelectTrigger><SelectContent><SelectItem v-for="item in data.paymentProviders" :key="item.provider" :value="item.provider">{{ item.name }}{{ item.channel === 'face_to_face' ? '（当面付）' : '' }}</SelectItem></SelectContent></Select>
            </label>
            <label class="grid gap-2 text-sm font-medium">优惠码
              <Input v-model="discountCode" autocomplete="off" placeholder="选填" />
            </label>
            <label class="grid gap-2 text-sm font-medium">备注
              <Textarea v-model="buyerNote" rows="3" class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="选填" />
            </label>
            <Alert v-if="error" variant="destructive"><AlertTitle>无法创建订单</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
            <Alert v-if="success" variant="default"><AlertTitle>{{ success.payment ? '支付请求已创建' : '订单已创建' }}</AlertTitle><AlertDescription>{{ success.payment ? '请继续完成支付，并保存订单号和查询令牌。' : '请保存订单号和查询令牌，以便查看交付内容。' }}</AlertDescription></Alert>
          </CardContent>
          <CardFooter class="flex-col items-stretch gap-3">
            <Button type="submit" :disabled="loading || success !== null">{{ loading ? "处理中..." : data.paymentProviders.length ? "创建订单并支付" : "创建零元订单" }}</Button>
            <p class="text-xs leading-5 text-muted-foreground">{{ data.paymentProviders.length ? '支付金额、订单状态和回调均会在服务端校验。' : '尚无可用支付渠道，仅当优惠后金额为零时才会创建订单。' }}</p>
          </CardFooter>
        </form>
      </Card>

      <aside class="h-fit rounded-md border bg-card p-5 text-sm">
        <p class="font-medium">订单摘要</p>
        <div class="mt-4 grid gap-3 border-y py-4">
          <div class="flex justify-between gap-3"><span class="text-muted-foreground">单价</span><span>{{ formatAmount(data.price) }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-muted-foreground">数量</span><span>{{ boundedQuantity }}</span></div>
          <div class="flex justify-between gap-3 font-medium"><span>原价</span><span>{{ formatAmount(data.price * boundedQuantity) }}</span></div>
        </div>
        <div v-if="success" class="mt-4 grid gap-2 break-all text-xs">
          <p><span class="text-muted-foreground">订单号：</span>{{ success.orderNo }}</p>
          <p><span class="text-muted-foreground">查询令牌：</span>{{ success.queryToken }}</p>
          <a v-if="success.payment?.mode === 'web'" :href="success.payment.redirectUrl" class="mt-2 text-sm font-medium hover:text-muted-foreground">前往支付宝付款</a>
          <a v-else href="/order" class="mt-2 text-sm font-medium hover:text-muted-foreground">前往订单查询</a>
          <div v-if="success.payment?.mode === 'face_to_face'" class="mt-3 grid gap-3"><p class="text-muted-foreground">请使用支付宝扫描二维码完成付款。</p><PaymentQrCode :value="success.payment.qrCode" /><a :href="success.payment.qrCode" class="break-all text-primary underline underline-offset-4" target="_blank" rel="noreferrer">打开支付宝付款链接</a></div>
        </div>
      </aside>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useData } from "vike-vue/useData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PaymentQrCode from "@/components/PaymentQrCode.vue";
import { onCreateCheckoutOrder } from "@/server/order/checkout.telefunc";
import { onCreatePayment } from "@/server/payment/checkout.telefunc";
import type { Data } from "./+data.server";

const data = useData<Data>();
const quantity = ref(data.minBuy);
const contactValue = ref("");
const receiverInfo = ref("");
const discountCode = ref("");
const paymentProvider = ref<"ALIPAY">("ALIPAY");
const buyerNote = ref("");
const error = ref<string | null>(null);
const loading = ref(false);
type CheckoutSuccess = Awaited<ReturnType<typeof onCreatePayment>>;
const success = ref<CheckoutSuccess | null>(null);
const boundedQuantity = computed(() => Math.max(data.minBuy, Math.min(data.maxBuy, Math.floor(Number(quantity.value) || data.minBuy))));

async function onSubmit() {
  error.value = null;
  success.value = null;
  loading.value = true;
  try {
    const orderInput = {
      productId: data.id,
      quantity: boundedQuantity.value,
      paymentProvider: paymentProvider.value,
      contactType: "EMAIL" as const,
      contactValue: contactValue.value,
      receiverInfo: receiverInfo.value,
      discountCode: discountCode.value,
      buyerNote: buyerNote.value,
    };
    success.value = data.paymentProviders.length
      ? await onCreatePayment(orderInput)
      : { ...await onCreateCheckoutOrder({ ...orderInput, paymentChannel: "web" }), payment: null };
  } catch (cause) {
    error.value = checkoutErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100);
}

function checkoutErrorMessage(cause: unknown) {
  const code = cause instanceof Error ? cause.message : "";
  return {
    PAYMENT_ADAPTER_NOT_AVAILABLE: "该订单仍需付款。支付渠道正在接入中，暂不能创建待支付订单。",
    PRODUCT_NOT_AVAILABLE: "商品已下架或不可购买。",
    PRODUCT_STOCK_NOT_ENOUGH: "库存不足，请调整数量后重试。",
    CONTACT_VALUE_REQUIRED: "请填写联系方式。",
    RECEIVER_INFO_REQUIRED: "请填写完整收件信息。",
    DISCOUNT_CODE_NOT_FOUND: "优惠码不存在。",
    DISCOUNT_CODE_DISABLED: "优惠码已停用。",
    DISCOUNT_CODE_EXPIRED: "优惠码已过期。",
    DISCOUNT_CODE_EXHAUSTED: "优惠码已达使用上限。",
    DISCOUNT_CODE_MIN_AMOUNT: "订单金额未达到优惠码门槛。",
    DISCOUNT_CODE_PRODUCT_NOT_ALLOWED: "此优惠码不能用于该商品。",
  }[code] ?? "请求未能完成，请稍后重试。";
}
</script>
