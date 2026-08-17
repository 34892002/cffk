<template>
  <main class="min-h-screen bg-muted/30">
    <header class="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <StorefrontBrand />
        <PublicNav />
      </div>
    </header>

    <section class="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6 sm:pb-16 sm:pt-28">
      <div class="mb-6">
        <h1 class="text-2xl font-semibold">订单中心</h1>
        <p class="mt-1 text-sm text-muted-foreground">通过本机记录、订单号和下单邮箱查询或恢复匿名订单。</p>
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside ref="orderSidebar" class="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle class="text-base">查询匿名订单</CardTitle>
              <CardDescription>使用订单号和对应的下单邮箱查询详情。</CardDescription>
            </CardHeader>
            <form novalidate @submit.prevent="submitQuery">
              <CardContent>
                <FieldGroup>
                  <VeeField v-slot="{ componentField, errors }" name="orderNo" :validate-on-input="true">
                    <Field :data-invalid="errors.length > 0">
                      <FieldLabel for="order-number">订单号</FieldLabel>
                      <Input id="order-number" v-bind="componentField" autocomplete="off" placeholder="ORD..." :aria-invalid="errors.length > 0" />
                      <FieldError v-if="errors.length" :errors="errors" />
                    </Field>
                  </VeeField>
                  <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true">
                    <Field :data-invalid="errors.length > 0">
                      <FieldLabel for="order-email">下单邮箱</FieldLabel>
                      <Input id="order-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" />
                      <FieldError v-if="errors.length" :errors="errors" />
                    </Field>
                  </VeeField>
                </FieldGroup>
                <Alert v-if="error" class="mt-4" variant="destructive"><AlertTitle>查询失败</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
              </CardContent>
              <CardFooter class="pt-5">
                <Button type="submit" class="w-full" :disabled="querySubmitting">
                  <SearchIcon data-icon="inline-start" />{{ querySubmitting ? "查询中..." : "查询匿名订单" }}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">邮箱 OTP 恢复</CardTitle>
              <CardDescription>验证下单邮箱后，以服务端最近的匿名订单原子覆盖该邮箱的本机分组。</CardDescription>
            </CardHeader>
            <VeeForm v-slot="{ isSubmitting: recoverySubmitting }" as="form" novalidate :validation-schema="recoverySchema" @submit="submitRecovery">
              <CardContent>
                <FieldGroup>
                  <VeeField v-slot="{ componentField, errors }" name="recoveryEmail" :validate-on-input="true">
                    <Field :data-invalid="errors.length > 0">
                      <FieldLabel for="recovery-email">下单邮箱</FieldLabel>
                      <Input id="recovery-email" v-bind="componentField" type="email" autocomplete="email" :disabled="Boolean(recoveryChallengeId)" :aria-invalid="errors.length > 0" />
                      <FieldError v-if="errors.length" :errors="errors" />
                    </Field>
                  </VeeField>
                  <VeeField v-if="recoveryChallengeId" v-slot="{ componentField, errors }" name="recoveryCode" :validate-on-input="true">
                    <Field :data-invalid="errors.length > 0">
                      <FieldLabel for="recovery-code">6 位验证码</FieldLabel>
                      <Input id="recovery-code" v-bind="componentField" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :aria-invalid="errors.length > 0" />
                      <FieldError v-if="errors.length" :errors="errors" />
                    </Field>
                  </VeeField>
                </FieldGroup>
                <p v-if="recoveryTruncated" class="mt-4 text-xs leading-5 text-muted-foreground">仅恢复最近 50 个匿名订单；更早记录未写入本机。</p>
              </CardContent>
              <CardFooter class="gap-2 pt-5">
                <Button v-if="recoveryChallengeId" type="button" variant="outline" :disabled="recoverySubmitting" @click="resetRecovery">更换邮箱</Button>
                <Button type="submit" class="flex-1" :disabled="recoverySubmitting">
                  {{ recoverySubmitting ? "处理中..." : recoveryChallengeId ? "验证并恢复" : "发送验证码" }}
                </Button>
              </CardFooter>
            </VeeForm>
          </Card>
        </aside>

        <section class="min-w-0 lg:min-h-0" aria-live="polite" :style="rightPanelStyle">
          <Card v-if="result" class="h-full w-full overflow-hidden">
            <CardHeader class="border-b">
              <div class="flex items-center justify-between gap-4">
                <div class="inline-flex cursor-pointer items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" role="link" aria-label="返回匿名订单列表" tabindex="0" @click="backToGuestList" @keydown.enter="backToGuestList" @keydown.space.prevent="backToGuestList"><ArrowLeftIcon class="size-4" />返回</div>
                <Badge :variant="statusVariant(result.status)">{{ statusLabel(result.status) }}</Badge>
              </div>
              <CardDescription class="mt-3">订单详情</CardDescription>
              <div class="flex min-w-0 items-baseline justify-between gap-4">
                <CardTitle class="min-w-0 truncate text-xl">{{ result.productName }}</CardTitle>
                <p class="shrink-0 break-all text-right font-mono text-xs leading-5 text-muted-foreground">{{ result.orderNo }}</p>
              </div>
            </CardHeader>
            <CardContent class="flex min-h-0 flex-col gap-6 overflow-y-auto pt-6 text-sm">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <div><dt class="text-xs text-muted-foreground">数量</dt><dd class="mt-1 font-medium">{{ result.quantity }}</dd></div>
                <div><dt class="text-xs text-muted-foreground">金额</dt><dd class="mt-1 font-medium">¥{{ result.amount }}</dd></div>
                <div><dt class="text-xs text-muted-foreground">支付状态</dt><dd class="mt-1 font-medium">{{ paymentStatusLabel(result.paymentStatus) }}</dd></div>
                <div><dt class="text-xs text-muted-foreground">发货状态</dt><dd class="mt-1 font-medium">{{ deliveryStatusLabel(result.deliveryStatus) }}</dd></div>
              </dl>



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
              <Button v-if="isFaceToFacePayment" as-child><a :href="`/checkout?orderNo=${encodeURIComponent(result.orderNo)}`">前往支付</a></Button><Button v-else :disabled="resumingPayment" @click="resumePayment">{{ resumingPayment ? "正在生成支付信息..." : "继续支付" }}</Button>
            </CardFooter>
          </Card>

          <Card v-else class="h-full w-full overflow-hidden lg:flex lg:min-h-0 lg:flex-col">
            <CardHeader class="border-b">
              <CardDescription>选择或查询订单</CardDescription>
              <CardTitle class="text-xl">匿名订单列表</CardTitle>
              <p class="text-sm leading-6 text-muted-foreground">本机保存的订单按下单邮箱分组。选择订单后可查看详情或继续支付。</p>
            </CardHeader>
            <CardContent v-if="guestGroups.length" class="min-h-0 overflow-hidden p-0 lg:flex-1">
              <OrderList :groups="guestGroups.map(group => ({ key: group.email, title: group.email, orders: group.orders }))" :on-select="(item, email) => openGuestOrder(email, item as LocalOrder)" :on-delete-group="requestClearGuestOrders" />
            </CardContent>
            <CardContent v-else class="grid min-h-64 place-items-center p-8 text-center lg:flex-1">
              <div class="max-w-sm">
                <SearchIcon class="mx-auto size-8 text-muted-foreground" />
                <h2 class="mt-4 font-medium">暂无本机匿名订单</h2>
                <p class="mt-2 text-sm leading-6 text-muted-foreground">请使用左侧表单按订单号和下单邮箱查询，或通过邮箱 OTP 恢复订单记录。</p>
              </div>
            </CardContent>
            <CardFooter v-if="guestGroups.length" class="justify-end border-t pt-5">
              <Button type="button" variant="outline" size="sm" @click="requestClearGuestOrders()">
                <Trash2Icon data-icon="inline-start" />删除全部匿名订单
              </Button>
            </CardFooter>
          </Card>
        </section>
      </div>
    </section>

    <Dialog :open="clearTarget !== undefined" @update:open="open => { if (!open) clearTarget = undefined; }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ clearTarget ? `删除 ${clearTarget} 的匿名订单？` : "删除全部匿名订单？" }}</DialogTitle>
          <DialogDescription>{{ clearTarget ? "此操作只会删除该邮箱分组，不影响其他邮箱的本机记录。" : "此操作会永久删除当前浏览器保存的全部匿名订单记录。" }}操作无法撤销。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose>
          <Button type="button" variant="destructive" @click="confirmClearGuestOrders">确认删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>

<script lang="ts" setup>
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, Form as VeeForm, useForm } from "vee-validate";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { ArrowLeftIcon, SearchIcon, Trash2Icon } from "@lucide/vue";

import { toast } from "vue-sonner";
import { usePageContext } from "vike-vue/usePageContext";
import { z } from "zod";

import PublicNav from "@/components/storefront/PublicNav.vue";
import OrderList from "@/components/storefront/OrderList.vue";
import StorefrontBrand from "@/components/storefront/StorefrontBrand.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { clearAllLocalOrders, deleteLocalOrdersForEmail, getLocalOrderGroups, replaceLocalOrdersForEmail, type LocalOrder } from "@/lib/local-orders";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onQueryOrder, onResumeOrderPayment, type PublicOrder } from "@/server/order/public.telefunc";
import { onSendGuestOrderRecoveryCode, onVerifyGuestOrderRecoveryCode } from "@/server/order/recovery.telefunc";


type GuestGroup = { email: string; orders: LocalOrder[] };
type RecoveryValues = { recoveryEmail: string; recoveryCode?: string };


const pageContext = usePageContext();
const rawOrderNo = pageContext.urlParsed.search.orderNo;
const requestedOrderNo = (typeof rawOrderNo === "string" ? rawOrderNo : "").trim();
const result = ref<PublicOrder | null>(null);
const error = ref<string | null>(null);
const resumingPayment = ref(false);
const guestGroups = ref<GuestGroup[]>([]);
const orderSidebar = ref<HTMLElement | null>(null);
const sidebarHeight = ref<number | null>(null);
const rightPanelStyle = computed(() => sidebarHeight.value === null ? undefined : { minHeight: `${sidebarHeight.value}px`, height: `${sidebarHeight.value}px` });
let sidebarResizeObserver: ResizeObserver | null = null;


const activeQuery = ref<{ orderNo: string; email?: string } | null>(null);
const clearTarget = ref<string | null | undefined>(undefined);
const recoveryChallengeId = ref("");
const recoveryTruncated = ref(false);
const isFaceToFacePayment = computed(() => result.value?.paymentChannel === "face_to_face");

const { handleSubmit, isSubmitting: querySubmitting, setFieldValue } = useForm({
  validationSchema: toTypedSchema(z.object({
    orderNo: z.string().trim().min(1, "请输入订单号。"),
    email: z.string().trim().email("请输入有效的下单邮箱。"),
  })),
  initialValues: { orderNo: "", email: "" },
});

const recoverySchema = computed(() => toTypedSchema(z.object({
  recoveryEmail: z.string().trim().email("请输入有效的下单邮箱。"),
  recoveryCode: recoveryChallengeId.value
    ? z.string().trim().regex(/^\d{6}$/, "请输入 6 位数字验证码。")
    : z.string().optional(),
})));

const submitQuery = handleSubmit(async values => {
  await queryOrder({ orderNo: values.orderNo.trim(), email: values.email.trim() });
});

function updateSidebarHeight() {
  sidebarHeight.value = orderSidebar.value?.getBoundingClientRect().height ?? null;
}

function backToGuestList() {
  result.value = null;
  error.value = null;
}

onMounted(() => {
  loadGuestGroups();
  nextTick(() => {
    updateSidebarHeight();
    if (orderSidebar.value && typeof ResizeObserver !== "undefined") {
      sidebarResizeObserver = new ResizeObserver(updateSidebarHeight);
      sidebarResizeObserver.observe(orderSidebar.value);
    }
  });

  if (!requestedOrderNo) return;
  const email = findGuestEmail(requestedOrderNo);
  if (email) {
    setFieldValue("orderNo", requestedOrderNo);
    setFieldValue("email", email);
    void queryOrder({ orderNo: requestedOrderNo, email });
  } else {
    setFieldValue("orderNo", requestedOrderNo);
    toast.info("请输入该匿名订单的下单邮箱后查询。");
  }
});

onUnmounted(() => {
  sidebarResizeObserver?.disconnect();
});


function loadGuestGroups() {
  guestGroups.value = Object.entries(getLocalOrderGroups()).map(([email, orders]) => ({ email, orders }));
}


function findGuestEmail(orderNo: string) {
  return guestGroups.value.find(group => group.orders.some(order => order.orderNo === orderNo))?.email;
}

function openGuestOrder(email: string, item: LocalOrder) {
  setFieldValue("orderNo", item.orderNo);
  setFieldValue("email", email);
  void queryOrder({ orderNo: item.orderNo, email });
}


function requestClearGuestOrders(email?: string) {
  clearTarget.value = email ?? null;
}

function confirmClearGuestOrders() {
  const target = clearTarget.value;
  if (target === undefined) return;
  const cleared = target === null ? clearAllLocalOrders() : deleteLocalOrdersForEmail(target);
  if (!cleared) {
    toast.error("无法删除本机匿名订单，请检查浏览器存储权限。");
    return;
  }
  loadGuestGroups();
  clearTarget.value = undefined;
  toast.success(target === null ? "全部本机匿名订单已删除。" : "该邮箱的本机匿名订单已删除。");
}

async function submitRecovery(values: Record<string, unknown>, actions: { resetForm: (state?: { values?: RecoveryValues }) => void }) {
  const email = String(values.recoveryEmail ?? "").trim().toLowerCase();
  recoveryTruncated.value = false;
  if (!recoveryChallengeId.value) {
    try {
      const response = await runTelefunc(() => onSendGuestOrderRecoveryCode({ email }), { notifyError: false });
      recoveryChallengeId.value = response.challengeId;
      actions.resetForm({ values: { recoveryEmail: email, recoveryCode: "" } });
      toast.success("验证码已发送，请检查邮箱。");
    } catch (cause) {
      toast.error(userErrorMessage(cause, "验证码发送失败，请稍后再试。"));
    }
    return;
  }

  try {
    const response = await runTelefunc(() => onVerifyGuestOrderRecoveryCode({
      challengeId: recoveryChallengeId.value,
      email,
      code: String(values.recoveryCode ?? "").trim(),
    }), { notifyError: false });
    const recoveredOrders: LocalOrder[] = response.orders.map(order => ({
      ...order,
      createdAt: new Date(order.createdAt).toISOString(),
    }));
    if (!replaceLocalOrdersForEmail(email, recoveredOrders)) {
      toast.error("验证成功，但无法写入浏览器存储；原有本机订单未更改。");
      return;
    }
    loadGuestGroups();
    recoveryTruncated.value = response.truncated;
    recoveryChallengeId.value = "";
    actions.resetForm({ values: { recoveryEmail: email, recoveryCode: "" } });
    toast.success(`已恢复 ${recoveredOrders.length} 个匿名订单。`);
    if (response.truncated) toast.info("仅恢复最近 50 个匿名订单，更早记录未写入本机。");
  } catch (cause) {
    toast.error(userErrorMessage(cause, "验证失败，原有本机订单未更改。"));
  }
}

function resetRecovery() {
  recoveryChallengeId.value = "";
  recoveryTruncated.value = false;
}

async function queryOrder(input: { orderNo: string; email?: string }) {
  error.value = null;
  result.value = null;

  activeQuery.value = input;
  try {
    const record = await runTelefunc(() => onQueryOrder(input), { notifyError: false });
    if (!record) {
      error.value = input.email ? "订单不存在，或下单邮箱不匹配。" : "未找到当前账户下的该订单。";
      return;
    }
    result.value = record;

  } catch (cause) {
    error.value = userErrorMessage(cause);
  }
}


async function resumePayment() {
  if (!result.value || resumingPayment.value || !activeQuery.value) return;
  resumingPayment.value = true;
  try {
    const payment = await runTelefunc(() => onResumeOrderPayment(activeQuery.value!), { notifyError: false });
    if (payment.payment?.mode === "redirect" && payment.payment.url) {
      window.location.assign(payment.payment.url);
      return;
    }
    if (payment.payment?.mode === "qr") {
      window.location.assign(`/checkout?orderNo=${encodeURIComponent(payment.orderNo)}`);
      return;
    }
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
