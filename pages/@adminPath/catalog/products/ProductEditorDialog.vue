<template>
  <Dialog :open="open" @update:open="requestClose">
    <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:w-[calc(100%-4rem)] sm:max-w-3xl" @interact-outside.prevent @escape-key-down.prevent>
      <DialogHeader class="border-b px-6 py-5"><DialogTitle>{{ editing ? "编辑商品" : mode === "quick" ? "快速添加商品" : "添加商品" }}</DialogTitle><DialogDescription>{{ mode === "quick" ? "填写核心信息后即可创建并上架商品，金额按元输入。" : "完整配置商品信息，金额按元输入。" }}</DialogDescription></DialogHeader>
      <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="submit">
        <div class="min-h-0 overflow-y-auto px-6 py-5">
          <div class="grid gap-6" :class="{ 'quick-product-form': mode === 'quick' }">
            <FieldSet class="gap-4">
              <FieldLegend>基本信息</FieldLegend><div class="grid gap-4 sm:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="name"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-name">商品名称</FieldLabel><Input id="product-name" v-bind="componentField" placeholder="例如：Pro 会员月卡" :aria-invalid="errors.length > 0" @update:model-value="onName" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ errors }" name="categoryId"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-category">分类</FieldLabel><Select :model-value="String(values.categoryId || '')" @update:model-value="setFieldValue('categoryId', Number($event))"><SelectTrigger id="product-category" :aria-invalid="errors.length > 0"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent><SelectItem v-for="item in activeCategories" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent></Select><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="slug"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-slug">Slug</FieldLabel><Input id="product-slug" v-bind="componentField" placeholder="留空则自动生成" :aria-invalid="errors.length > 0" @update:model-value="onSlug" /><FieldDescription>前台路径：/product/{{ values.slug || "slug" }}</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField }" name="subtitle"><Field><FieldLabel for="product-subtitle">副标题</FieldLabel><Input id="product-subtitle" v-bind="componentField" placeholder="用于 SEO 摘要，建议包含核心关键词" /></Field></VeeField>
              </div>
            </FieldSet>
            <FieldSet class="gap-4"><FieldLegend>商品媒体与详情</FieldLegend><VeeField v-slot="{ componentField }" name="coverImage"><Field><FieldLabel for="product-cover">封面 URL</FieldLabel><div class="flex gap-2"><Input id="product-cover" v-bind="componentField" placeholder="/media/proxy/... 或外部图片 URL" /><Button type="button" variant="outline" @click="mediaPickerOpen = true">从媒体库选择</Button></div><img v-if="values.coverImage" :src="values.coverImage" alt="商品封面预览" class="h-24 w-40 rounded-md border object-cover" /></Field></VeeField><VeeField v-slot="{ componentField }" name="description"><Field><FieldLabel for="product-description">商品详情</FieldLabel><Textarea v-if="mode === 'quick'" id="product-description" v-bind="componentField" rows="5" placeholder="简要说明商品内容、使用方式或发货范围" /><ProductRichTextEditor v-else :model-value="values.description" @update:model-value="setFieldValue('description', $event)" /></Field></VeeField></FieldSet>
            <FieldSet class="gap-4"><FieldLegend>价格与购买规则</FieldLegend><div class="quick-price-grid grid gap-4 sm:grid-cols-2"><VeeField v-slot="{ componentField, errors }" name="price"><Field :data-invalid="errors.length > 0"><FieldLabel>价格（元）</FieldLabel><Input v-bind="componentField" inputmode="decimal" :aria-invalid="errors.length > 0" /><FieldDescription>价格预览 <span class="font-medium text-foreground">¥{{ pricePreview(values.price) }}</span></FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-if="values.deliveryType !== 'FIXED_CARD'" v-slot="{ componentField }" name="minBuy"><Field><FieldLabel>最小购买数</FieldLabel><Input v-bind="componentField" type="number" min="1" /></Field></VeeField><VeeField v-if="values.deliveryType !== 'FIXED_CARD'" v-slot="{ componentField, errors }" name="maxBuy"><Field :data-invalid="errors.length > 0"><FieldLabel>最大购买数</FieldLabel><Input v-bind="componentField" type="number" min="1" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField }" name="sort"><Field><FieldLabel>排序</FieldLabel><Input v-bind="componentField" type="number" min="0" /></Field></VeeField></div></FieldSet>
            <FieldSet class="gap-4"><FieldLegend>发货与库存</FieldLegend><VeeField v-slot="{ errors }" name="deliveryType"><Field :data-invalid="errors.length > 0"><FieldLabel>发货方式</FieldLabel><Select v-model="deliveryType"><SelectTrigger :aria-invalid="errors.length > 0"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in deliveryOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select><FieldDescription>{{ selectedDeliveryOption?.description }}</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><Field v-if="values.deliveryType === 'CARD_AUTO'"><FieldLabel>卡密库存</FieldLabel><FieldDescription>可用卡密：{{ props.cardInventory?.available ?? 0 }} 条。卡密内容仅可在<a :href="cardManagementPath" class="text-primary underline-offset-4 hover:underline">管理卡密</a>页查看和维护。</FieldDescription></Field><VeeField v-if="values.deliveryType === 'FIXED_CARD'" v-slot="{ componentField, errors }" name="fixedDeliveryContent"><Field :data-invalid="errors.length > 0"><FieldLabel>固定发货内容</FieldLabel><Textarea v-bind="componentField" rows="3" placeholder="买家支付后会收到这段固定内容" /><FieldDescription>每次支付后都会向买家发送相同内容，不使用卡密库存。</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-if="requiresPhysicalStock" v-slot="{ componentField }" name="physicalStock"><Field><FieldLabel>实物库存</FieldLabel><Input v-bind="componentField" type="number" min="0" placeholder="留空表示不限库存" /><FieldDescription>设置库存数量，每次下单扣减 1。留空表示不限库存。</FieldDescription></Field></VeeField><VeeField v-if="requiresPhysicalStock" v-slot="{ componentField }" name="manualDeliveryHint"><Field><FieldLabel>{{ values.deliveryType === "MANUAL" ? "手动发货说明（可选）" : "快递发货说明（可选）" }}</FieldLabel><Textarea v-bind="componentField" rows="3" :placeholder="values.deliveryType === 'MANUAL' ? '例如：请留下账号信息，管理员将在 24 小时内处理' : '例如：请填写收货地址，管理员将在 48 小时内安排发货'" /></Field></VeeField></FieldSet>
            <FieldSet v-if="mode === 'complete'" class="gap-4"><FieldLegend>发布设置</FieldLegend><VeeField name="status"><Field><FieldLabel>状态</FieldLabel><Select v-model="status"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent></Select></Field></VeeField><VeeField v-slot="{ componentField }" name="purchaseNote"><Field><FieldLabel>购买须知</FieldLabel><Textarea v-bind="componentField" rows="3" placeholder="例如：虚拟商品售出后不支持退款，请确认商品信息后购买" /></Field></VeeField></FieldSet>
          </div>
        </div><DialogFooter class="border-t bg-background px-6 py-4"><Button type="button" variant="outline" :disabled="saving || loadingDetail" @click="requestClose(true)">取消</Button><Button type="button" variant="outline" :disabled="saving || loadingDetail" @click="saveAsDraft">草稿</Button><Button type="submit" :disabled="saving || loadingDetail">{{ saving ? "保存中..." : loadingDetail ? "加载中..." : "上架" }}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog><MediaPickerDialog v-model:open="mediaPickerOpen" @select="setFieldValue('coverImage', $event)" /><Dialog v-model:open="confirmOpen"><DialogContent class="sm:max-w-md"><DialogHeader><DialogTitle>放弃未保存的修改？</DialogTitle><DialogDescription>当前表单有未保存内容，关闭后这些修改将丢失。</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" @click="confirmOpen = false">继续编辑</Button><Button type="button" variant="destructive" @click="discardChanges">放弃修改</Button></DialogFooter></DialogContent></Dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { toTypedSchema } from "@vee-validate/zod";

import { Field as VeeField, useForm } from "vee-validate";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";
import ProductRichTextEditor from "./ProductRichTextEditor.vue";
import { defaultProductForm, formToSaveInput, productFormSchema, slugifyProductName, type ProductForm } from "./product-form";

type Category = { id: number; name: string; status: string };
const props = defineProps<{ open: boolean; categories: Category[]; detail?: ProductForm | null; cardInventory?: { available: number; managementPath: string } | null; saving?: boolean; loadingDetail?: boolean }>();
const pageContext = usePageContext();
const cardManagementPath = `/${pageContext.routeParams.adminPath}/catalog/cards`;
const emit = defineEmits<{ "update:open": [value: boolean]; save: [value: ReturnType<typeof formToSaveInput>, mode: "quick" | "complete"] }>();
const mode = ref<"quick" | "complete">("quick"); const mediaPickerOpen = ref(false); const confirmOpen = ref(false); const slugTouched = ref(false);
const { values, handleSubmit, resetForm, setFieldValue, meta } = useForm<ProductForm>({ validationSchema: toTypedSchema(productFormSchema), initialValues: defaultProductForm() });
const activeCategories = computed(() => props.categories.filter((item) => item.status === "ACTIVE"));
const deliveryOptions = [
  { value: "CARD_AUTO", label: "自动发货卡密", description: "从卡密库存中自动分配未售卡密。" },
  { value: "FIXED_CARD", label: "固定内容自动发货", description: "每次支付后发送同一份固定内容，不使用卡密库存。" },
  { value: "MANUAL", label: "手动发货", description: "支付后等待管理员在订单详情填写发货内容。" },
  { value: "EXPRESS", label: "快递发货", description: "买家下单时填写收货信息，支付后管理员安排快递发货。" },
] as const;
const requiresPhysicalStock = computed(() => values.deliveryType === "MANUAL" || values.deliveryType === "EXPRESS");
const selectedDeliveryOption = computed(() => deliveryOptions.find((option) => option.value === values.deliveryType));
function pricePreview(value: string) { const amount = Number(value); return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : "0.00"; }
const editing = computed(() => Boolean(values.id));
const deliveryType = computed({ get: () => values.deliveryType, set: (v) => setFieldValue("deliveryType", v as ProductForm["deliveryType"]) });
const status = computed({ get: () => values.status, set: (v) => setFieldValue("status", v as ProductForm["status"]) });

function loadForm() { resetForm({ values: { ...defaultProductForm(activeCategories.value[0]?.id ?? null), status: "ACTIVE" } }); mode.value = "quick"; slugTouched.value = false; }
watch(() => props.open, (open) => { if (open && !props.loadingDetail) loadForm(); });
watch(() => props.detail, (detail) => { if (props.open && detail) loadForm(); });
watch(() => values.deliveryType, (value) => { if (value === "FIXED_CARD") { setFieldValue("minBuy", 1); setFieldValue("maxBuy", 1); } });
function onName(payload: string | number) { const value = String(payload); setFieldValue("name", value); if (!slugTouched.value && !values.id) setFieldValue("slug", slugify(value)); }
function onSlug(payload: string | number) { slugTouched.value = true; setFieldValue("slug", String(payload)); }
function slugify(value: string) { return slugifyProductName(value); }
function requestClose(force = false) { if (force && meta.value.dirty) { confirmOpen.value = true; return; } emit("update:open", false); }
function discardChanges() { confirmOpen.value = false; emit("update:open", false); }
const submit = handleSubmit((form) => emit("save", formToSaveInput({ ...form, status: "ACTIVE" }), mode.value));
const saveAsDraft = handleSubmit((form) => emit("save", formToSaveInput({ ...form, status: "DRAFT" }), mode.value));
</script>

<style scoped>
@media (min-width: 1024px) {
  .quick-product-form :deep(fieldset:nth-of-type(1) [data-slot="field"]),
  .quick-product-form :deep(fieldset:nth-of-type(2) [data-slot="field"]),
  .quick-product-form :deep(fieldset:nth-of-type(4) [data-slot="field"]),
  .quick-product-form :deep(.quick-price-grid [data-slot="field"]) {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    align-items: start;
    column-gap: 1rem;
    row-gap: 0.5rem;
  }

  .quick-product-form :deep(fieldset:nth-of-type(1) [data-slot="field-label"]),
  .quick-product-form :deep(fieldset:nth-of-type(2) [data-slot="field-label"]),
  .quick-product-form :deep(fieldset:nth-of-type(4) [data-slot="field-label"]),
  .quick-product-form :deep(.quick-price-grid [data-slot="field-label"]) {
    grid-column: 1;
    padding-top: 0.5rem;
  }

  .quick-product-form :deep(fieldset:nth-of-type(1) [data-slot="field-description"]),
  .quick-product-form :deep(fieldset:nth-of-type(1) [data-slot="field-error"]),
  .quick-product-form :deep(fieldset:nth-of-type(2) [data-slot="field-description"]),
  .quick-product-form :deep(fieldset:nth-of-type(2) [data-slot="field-error"]),
  .quick-product-form :deep(fieldset:nth-of-type(2) img),
  .quick-product-form :deep(fieldset:nth-of-type(4) [data-slot="field-description"]),
  .quick-product-form :deep(fieldset:nth-of-type(4) [data-slot="field-error"]),
  .quick-product-form :deep(.quick-price-grid [data-slot="field-description"]),
  .quick-product-form :deep(.quick-price-grid [data-slot="field-error"]) {
    grid-column: 2;
  }
}
</style>
