<template>
  <main class="min-h-screen bg-muted/30">
    <header class="border-b bg-background">
      <div class="mx-auto flex min-h-16 max-w-5xl items-center justify-between px-5">
        <Button variant="ghost" size="sm" as-child><a href="/"><ArrowLeftIcon />返回商品列表</a></Button>
        <Button variant="ghost" size="sm" as-child><a href="/order">我的订单</a></Button>
      </div>
    </header>

    <section class="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <article class="min-w-0">
        <div class="aspect-square overflow-hidden rounded-xl border bg-muted">
          <img :src="data.coverImage || defaultProductImage" :alt="data.name" class="size-full object-cover" />
        </div>
        <Badge variant="secondary" class="mt-6">{{ data.categoryName || "商品" }}</Badge>
        <h1 class="mt-4 text-3xl font-semibold tracking-normal">{{ data.name }}</h1>
        <p v-if="data.subtitle" class="mt-3 text-base leading-7 text-muted-foreground">{{ data.subtitle }}</p>
        <div v-if="data.description" class="mt-8 whitespace-pre-wrap border-t pt-8 text-sm leading-7 text-foreground">{{ data.description }}</div>
      </article>

      <aside class="h-fit lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardDescription>当前价格</CardDescription>
            <CardTitle class="text-3xl tabular-nums">{{ formatAmount(data.price) }}</CardTitle>
          </CardHeader>
          <form class="grid gap-6" @submit.prevent="onSubmit">
            <CardContent class="grid gap-4">
              <div class="grid gap-3 border-y py-4 text-sm">
                <div class="flex items-center justify-between gap-4"><span class="text-muted-foreground">交付方式</span><span>{{ deliveryLabel(data.deliveryType) }}</span></div>
                <div class="flex items-center justify-between gap-4"><span class="text-muted-foreground">购买限制</span><span>{{ data.minBuy }} - {{ data.maxBuy }} 件</span></div>
                <div v-if="data.isVisibleStock" class="flex items-center justify-between gap-4"><span class="text-muted-foreground">库存</span><span :class="stockClass">{{ stockLabel }}</span></div>
              </div>
              <label class="grid gap-2 text-sm font-medium">
                联系方式<span v-if="data.isContactRequired" class="text-destructive">*</span>
                <Input v-model="contactValue" :required="data.isContactRequired" :placeholder="data.isContactRequired ? '用于接收订单通知' : '选填'" />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                购买数量
                <Input v-model.number="quantity" type="number" :min="data.minBuy" :max="data.maxBuy" required />
              </label>
              <label v-if="data.deliveryType === 'EXPRESS'" class="grid gap-2 text-sm font-medium">
                收件信息
                <Textarea v-model="receiverInfo" required rows="3" placeholder="姓名、电话、详细地址" />
              </label>
              <label v-if="data.paymentProviders.length" class="grid gap-2 text-sm font-medium">
                支付方式
                <Select v-model="paymentProvider"><SelectTrigger><SelectValue placeholder="选择支付方式" /></SelectTrigger><SelectContent><SelectItem v-for="item in data.paymentProviders" :key="item.provider" :value="item.provider">{{ item.name }}{{ item.channel === 'face_to_face' ? '（当面付）' : '' }}</SelectItem></SelectContent></Select>
              </label>
              <label class="grid gap-2 text-sm font-medium">
                优惠码
                <Input v-model="discountCode" autocomplete="off" placeholder="选填" />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                备注
                <Textarea v-model="buyerNote" rows="3" placeholder="选填" />
              </label>
              <p v-if="data.manualDeliveryHint" class="text-sm leading-6 text-muted-foreground">{{ data.manualDeliveryHint }}</p>
              <p v-if="data.purchaseNote" class="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{{ data.purchaseNote }}</p>
              <Alert v-if="error" variant="destructive"><AlertTitle>无法创建订单</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
              <Alert v-if="success" variant="default"><AlertTitle>{{ success.payment ? '支付请求已创建' : '订单已创建' }}</AlertTitle><AlertDescription>{{ success.payment ? '请继续完成支付，并保存订单号和查询令牌。' : '请保存订单号和查询令牌，以便查看交付内容。' }}</AlertDescription></Alert>
              <div v-if="success" class="grid gap-2 break-all rounded-md border bg-muted/40 p-3 text-xs">
                <p><span class="text-muted-foreground">订单号：</span>{{ success.orderNo }}</p>
                <p><span class="text-muted-foreground">查询令牌：</span>{{ success.queryToken }}</p>
                <a v-if="success.payment?.mode === 'web'" :href="success.payment.redirectUrl" class="text-sm font-medium hover:text-muted-foreground">前往支付宝付款</a>
                <a v-else href="/order" class="text-sm font-medium hover:text-muted-foreground">查看我的订单</a>
                <template v-if="success.payment?.mode === 'face_to_face'"><p class="mt-2 text-muted-foreground">请使用支付宝扫描二维码完成付款。</p><PaymentQrCode :value="success.payment.qrCode" /></template>
              </div>
            </CardContent>
            <CardFooter class="flex-col items-stretch gap-3">
              <Button type="submit" :disabled="loading || success !== null || isSoldOut">{{ isSoldOut ? "暂时缺货" : loading ? "处理中..." : data.paymentProviders.length ? "提交订单并支付" : "创建零元订单" }}</Button>
              <p class="text-xs leading-5 text-muted-foreground">{{ data.paymentProviders.length ? "支付金额、订单状态和回调均会在服务端校验。" : "尚无可用支付渠道，仅当优惠后金额为零时才会创建订单。" }}</p>
            </CardFooter>
          </form>
        </Card>
      </aside>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { ArrowLeftIcon } from "@lucide/vue";
import { useData } from "vike-vue/useData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PaymentQrCode from "@/components/PaymentQrCode.vue";
import defaultProductImage from "@/assets/product_img.jpg?url";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
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
const isSoldOut = computed(() => data.deliveryType === "CARD_AUTO" && (data.availableStock ?? 0) === 0);
const stockLabel = computed(() => {
  if (data.deliveryType === "CARD_AUTO") return (data.availableStock ?? 0) > 0 ? `库存 ${data.availableStock}` : "暂时缺货";
  if (data.stockMode === "UNLIMITED") return "库存充足";
  if (data.availableStock === null) return "库存有限";
  return data.availableStock > 0 ? `库存 ${data.availableStock}` : "暂时缺货";
});
const stockClass = computed(() => data.availableStock === 0 ? "text-destructive" : "");

async function onSubmit() {
  error.value = null;
  success.value = null;
  loading.value = true;
  try {
    const orderInput = { productId: data.id, quantity: boundedQuantity.value, paymentProvider: paymentProvider.value, contactType: "EMAIL" as const, contactValue: contactValue.value, receiverInfo: receiverInfo.value, discountCode: discountCode.value, buyerNote: buyerNote.value };
    success.value = data.paymentProviders.length
      ? await runTelefunc(() => onCreatePayment(orderInput), { notifyError: false })
      : { ...await runTelefunc(() => onCreateCheckoutOrder({ ...orderInput, paymentChannel: "web" }), { notifyError: false }), payment: null };
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

function formatAmount(amount: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100); }
function deliveryLabel(deliveryType: Data["deliveryType"]) { return { CARD_AUTO: "自动发货", FIXED_CARD: "固定内容发货", MANUAL: "人工发货", EXPRESS: "物流发货" }[deliveryType]; }
</script>
