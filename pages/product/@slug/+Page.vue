<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur"><div class="mx-auto flex min-h-16 max-w-5xl items-center justify-between px-5"><Button variant="ghost" size="sm" as-child><a href="/"><ArrowLeftIcon />返回商品列表</a></Button><nav class="flex gap-2"><Button variant="ghost" size="sm" as-child><a href="/">首页</a></Button><Button variant="outline" size="sm" as-child><a href="/order">我的订单</a></Button></nav></div></header>
    <section class="mx-auto grid max-w-5xl gap-8 px-5 pb-10 pt-26 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <article>
        <div class="aspect-square overflow-hidden rounded-xl border bg-muted"><img :src="data.coverImage || defaultProductImage" :alt="data.name" class="size-full object-cover" /></div><Badge variant="secondary" class="mt-6">{{ data.categoryName || "商品" }}</Badge><h1 class="mt-4 text-3xl font-semibold">{{ data.name }}</h1><p v-if="data.subtitle" class="mt-3 text-muted-foreground">{{ data.subtitle }}</p>
        <!-- `description` is sanitized server-side by sanitizeProductDescription(). -->
        <!-- eslint-disable vue/no-v-html -->
        <div v-if="data.description" class="product-rich-content mt-8 border-t pt-8 text-sm leading-7" v-html="data.description" />
        <!-- eslint-enable vue/no-v-html -->
        <div class="mt-6 grid gap-3 rounded-md border bg-muted/30 p-4 text-sm"><p class="whitespace-pre-wrap"><span class="font-medium">购买说明：</span>{{ purchaseNote }}</p><p v-if="deliveryHint" class="whitespace-pre-wrap"><span class="font-medium">发货提示：</span>{{ deliveryHint }}</p></div>
      </article>
      <aside class="h-fit lg:sticky lg:top-6">
        <Card>
          <CardHeader><CardDescription>当前价格</CardDescription><CardTitle class="text-3xl">¥{{ data.price }}</CardTitle></CardHeader><form class="grid gap-6" @submit.prevent="onSubmit">
            <CardContent class="grid gap-4">
              <p v-if="requiresPayment && !methods.length" class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">当前没有可用的支付方式，请稍后再试。</p>
              <label class="grid gap-2 text-sm font-medium">联系方式<span class="text-destructive">*</span><Input v-model="contactValue" required /></label>
              <label class="grid gap-2 text-sm font-medium">购买数量<Input v-model.number="quantity" type="number" :min="data.minBuy" :max="purchaseLimit" required /><span v-if="isStockLimited" class="text-xs font-normal text-muted-foreground">可用库存：{{ availableStock }}</span></label>
              <label v-if="data.deliveryType === 'EXPRESS'" class="grid gap-2 text-sm font-medium">收件信息<Textarea v-model="receiverInfo" required rows="3" /></label>
              <label v-if="methods.length" class="grid gap-2 text-sm font-medium">支付方式<Select v-model="selectedMethod"><SelectTrigger><SelectValue placeholder="选择支付方式" /></SelectTrigger><SelectContent><SelectItem v-for="item in methods" :key="item.key" :value="item.key">{{ item.name }}{{ item.channel ? `（${channelLabel(item.channel)}）` : "" }}</SelectItem></SelectContent></Select></label>
              <div class="grid gap-2 text-sm font-medium"><span>优惠码</span><div class="flex gap-2"><Input v-model="discountCode" autocomplete="off" @keydown.enter.prevent="onApplyDiscount" /><Button type="button" variant="outline" :disabled="discountApplying || !discountCode.trim()" @click="onApplyDiscount">{{ discountApplying ? "应用中..." : "应用" }}</Button></div></div>
              <div v-if="discountPreview" class="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><div class="flex justify-between gap-4"><span class="text-muted-foreground">原价</span><span>¥{{ discountPreview.originalAmount }}</span></div><div class="flex justify-between gap-4"><span class="text-muted-foreground">优惠码 {{ discountPreview.code }}</span><span class="text-destructive">-¥{{ discountPreview.discountAmount }}</span></div><div class="flex justify-between gap-4 border-t pt-2 font-medium"><span>应付金额</span><span>¥{{ discountPreview.finalAmount }}</span></div></div>
              <label class="grid gap-2 text-sm font-medium">备注<Textarea v-model="buyerNote" rows="3" /></label>

              <div v-if="success" class="grid gap-2 break-all rounded-md border bg-muted/40 p-3 text-xs"><p>订单号：{{ success.orderNo }}</p><p>查询令牌：{{ success.queryToken }}</p><a v-if="success.payment?.mode === 'redirect'" :href="success.payment.url" class="text-sm font-medium">前往支付</a><template v-if="success.payment?.mode === 'qr'"><p>请扫码完成付款。</p><PaymentQrCode :value="success.payment.qrCode!" /></template><a v-if="!success.payment" href="/order" class="text-sm font-medium">查看我的订单</a></div>
            </CardContent><CardFooter class="flex-col items-stretch gap-3"><Button type="submit" :disabled="loading || success !== null || isOutOfStock || (requiresPayment && !methods.length)">{{ loading ? "处理中..." : isOutOfStock ? "暂时缺货" : requiresPayment ? "提交订单并支付" : "创建零元订单" }}</Button><p class="text-xs text-muted-foreground">支付金额与订单状态均由服务端校验。</p></CardFooter>
          </form>
        </Card>
      </aside>
    </section>
  </main>
</template>
<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { ArrowLeftIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { useData } from "vike-vue/useData";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PaymentQrCode from "@/components/PaymentQrCode.vue";
import defaultProductImage from "@/assets/product_img.jpg?url";
import { saveLocalOrder } from "@/lib/local-orders";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onPreviewDiscount } from "@/server/discount/preview.telefunc";
import { onCreatePayment } from "@/server/payment/checkout.telefunc";
import type { PaymentChannel, PaymentProviderKind } from "@/server/payment/registry";
import type { Data } from "./+data.server";
const data = useData<Data>();
type PaymentMethod = { key: string; provider: PaymentProviderKind; channel?: PaymentChannel; name: string };
const methods = computed<PaymentMethod[]>(() => data.paymentProviders.flatMap((provider): PaymentMethod[] => provider.channels.length ? provider.channels.map((channel) => ({ key: `${provider.provider}:${channel}`, provider: provider.provider, channel, name: provider.name })) : [{ key: `${provider.provider}:`, provider: provider.provider, name: provider.name }]));
const purchaseNote = computed(() => data.purchaseNote || "下单后将生成待支付订单，支付成功后会给您的联系邮箱发送通知，请注意查看。");
const deliveryHint = computed(() => {
  if (data.deliveryType === "MANUAL") return data.manualDeliveryHint || "支付后，客服将尽快为您处理订单，请耐心等待。";
  if (data.deliveryType === "EXPRESS") return data.manualDeliveryHint || "请填写收货信息，支付后管理员将安排快递发货。";
  return null;
});
const selectedMethod = ref(methods.value[0]?.key ?? ""); const quantity = ref(data.minBuy); const contactValue = ref(""); const receiverInfo = ref(""); const discountCode = ref(""); const buyerNote = ref(""); const discountApplying = ref(false); type DiscountPreview = Awaited<ReturnType<typeof onPreviewDiscount>>; const discountPreview = ref<DiscountPreview | null>(null); const loading = ref(false); type CheckoutSuccess = Exclude<Awaited<ReturnType<typeof onCreatePayment>>, { errorCode: string }>; const success = ref<CheckoutSuccess | null>(null);
const requiresPayment = computed(() => (discountPreview.value?.finalAmount ?? data.price) !== "0.00");
const isStockLimited = computed(() => data.deliveryType === "CARD_AUTO" || data.stockMode === "FINITE");
const availableStock = computed(() => data.availableStock ?? 0);
const purchaseLimit = computed(() => isStockLimited.value ? Math.max(data.minBuy, Math.min(data.maxBuy, availableStock.value)) : data.maxBuy);
const isOutOfStock = computed(() => isStockLimited.value && availableStock.value < data.minBuy);
watch([discountCode, quantity], () => { discountPreview.value = null; });
async function onApplyDiscount() { const code = discountCode.value; if (!code.trim()) return; const requestedQuantity = quantity.value; discountPreview.value = null; discountApplying.value = true; try { const preview = await runTelefunc(() => onPreviewDiscount({ productId: data.id, quantity: requestedQuantity, discountCode: code }), { notifyError: false }); if (discountCode.value === code && quantity.value === requestedQuantity) discountPreview.value = preview; } catch (cause) { if (discountCode.value === code && quantity.value === requestedQuantity) toast.error(userErrorMessage(cause, "暂时无法验证优惠码，请稍后再试。")); } finally { discountApplying.value = false; } }
async function onSubmit() { if (isOutOfStock.value || (isStockLimited.value && quantity.value > availableStock.value)) { toast.error("库存不足，请调整数量后重试。"); return; } if (discountCode.value.trim() && !discountPreview.value) { toast.info("请先应用优惠码。"); return; } const method = methods.value.find((item) => item.key === selectedMethod.value); if (!method && requiresPayment.value) { toast.error("当前没有可用的支付方式，请稍后再试。"); return; } loading.value = true; try { const created = await runTelefunc(() => onCreatePayment({ productId: data.id, quantity: quantity.value, paymentProvider: method?.provider ?? "ALIPAY", paymentChannel: method?.channel, contactType: "EMAIL", contactValue: contactValue.value, receiverInfo: receiverInfo.value, discountCode: discountPreview.value?.code, buyerNote: buyerNote.value }), { notifyError: false }); if ("errorCode" in created) { toast.error(userErrorMessage(new Error(created.errorCode), "订单暂时无法提交，请稍后再试。")); return; } saveLocalOrder({ orderNo: created.orderNo, queryToken: created.queryToken, productName: data.name, amount: requiresPayment.value ? (discountPreview.value?.finalAmount ?? data.price) : "0.00", createdAt: new Date().toISOString() }); success.value = created; if (created.payment?.mode === "redirect" && created.payment.url) { window.location.assign(created.payment.url); return; } if (created.payment?.mode === "qr") return; window.location.assign(`/order?orderNo=${encodeURIComponent(created.orderNo)}&token=${encodeURIComponent(created.queryToken)}`); } catch (cause) { toast.error(userErrorMessage(cause, "订单暂时无法提交，请稍后再试。")); } finally { loading.value = false; } }
function channelLabel(channel: string) { return ({ web: "网页/H5", wap: "H5", face_to_face: "当面付", alipay: "支付宝", wxpay: "微信" } as Record<string, string>)[channel] ?? channel; }
</script>
