<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions><Button variant="outline" @click="goBack">返回商品列表</Button></template>
    </AdminPageHeader>
    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <form class="border-t" novalidate @submit.prevent="submit">
      <div class="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <FieldGroup class="gap-6">
          <FieldSet class="gap-4"><FieldLegend><span class="text-destructive">*</span> 商品名称</FieldLegend><VeeField v-slot="{ componentField, errors }" name="name"><Field :data-invalid="errors.length > 0"><Input id="product-name" v-bind="componentField" placeholder="例如：Pro 会员月卡" aria-label="商品名称" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField></FieldSet>
          <FieldSeparator />
          <FieldSet class="gap-4"><FieldLegend><span class="text-destructive">*</span> 商品详情</FieldLegend><VeeField v-slot="{ errors }" name="description"><Field :data-invalid="errors.length > 0"><ProductRichTextEditor :model-value="values.description" @update:model-value="setFieldValue('description', $event)" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField></FieldSet>
          <FieldSeparator />
          <FieldSet class="gap-4"><FieldLegend>购买须知</FieldLegend><VeeField v-slot="{ componentField }" name="purchaseNote"><Field><Textarea v-bind="componentField" rows="3" placeholder="例如：虚拟商品售出后不支持退款，请确认商品信息后购买" aria-label="购买须知" /></Field></VeeField></FieldSet>
          <FieldSeparator />
          <FieldSet class="gap-4"><FieldLegend>发货与库存</FieldLegend><VeeField v-slot="{ errors }" name="deliveryType"><Field :data-invalid="errors.length > 0"><FieldLabel><span class="text-destructive">*</span> 发货方式</FieldLabel><FieldDescription v-if="editing">商品创建后不可修改发货方式。</FieldDescription><RadioGroup v-model="deliveryType" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" :aria-invalid="errors.length > 0" :disabled="editing"><label v-for="option in deliveryOptions" :key="option.value" class="flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"><RadioGroupItem :value="option.value" class="mt-1" /><span class="grid gap-1"><span class="text-sm font-medium">{{ option.label }}</span><span class="text-xs text-muted-foreground">{{ option.description }}</span></span></label></RadioGroup><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><Field v-if="values.deliveryType === 'CARD_AUTO'"><FieldLabel>卡密库存</FieldLabel><FieldDescription>可用卡密：{{ cardInventory?.available ?? 0 }} 条。卡密内容仅可在<a :href="cardManagementPath" class="text-primary underline-offset-4 hover:underline">管理卡密</a>页查看和维护。</FieldDescription></Field><VeeField v-if="values.deliveryType === 'FIXED_CARD'" v-slot="{ componentField, errors }" name="fixedDeliveryContent"><Field :data-invalid="errors.length > 0"><FieldLabel><span class="text-destructive">*</span> 固定发货内容</FieldLabel><Textarea v-bind="componentField" rows="3" placeholder="买家支付后会收到这段固定内容" /><FieldDescription>每次支付后都会向买家发送相同内容，不使用卡密库存。</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-if="requiresPhysicalStock" v-slot="{ componentField, errors }" name="physicalStock"><Field :data-invalid="errors.length > 0"><FieldLabel><span class="text-destructive">*</span> 可售库存 <TooltipProvider><Tooltip><TooltipTrigger as-child><button type="button" class="inline-flex text-orange-500" aria-label="可售库存说明"><InfoIcon class="size-4" /></button></TooltipTrigger><TooltipContent class="w-56 max-w-none text-left" style="text-wrap: wrap;"><p>新建商品时，可售库存就是商品的实际库存。下单后库存会被锁定；编辑商品时，填写的是当前还能销售的数量，不包含已锁定库存。订单取消或超时后，锁定库存会自动释放。</p></TooltipContent></Tooltip></TooltipProvider></FieldLabel><Input v-bind="componentField" type="number" min="0" placeholder="请输入库存数量" :aria-invalid="errors.length > 0" /><FieldDescription>请输入库存数量，每次下单按购买数量扣减。</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-if="requiresPhysicalStock" v-slot="{ componentField }" name="manualDeliveryHint"><Field><FieldLabel>{{ values.deliveryType === "MANUAL" ? "手动发货说明（可选）" : "快递发货说明（可选）" }}</FieldLabel><Textarea v-bind="componentField" rows="3" :placeholder="values.deliveryType === 'MANUAL' ? '例如：请留下账号信息，管理员将在 24 小时内处理' : '例如：请填写收货地址，管理员将在 48 小时内安排发货'" /></Field></VeeField></FieldSet>
        </FieldGroup>

        <aside class="lg:border-l lg:pl-8">
          <FieldGroup class="gap-6">
            <FieldSet class="gap-4"><FieldLegend>商品分类</FieldLegend><VeeField v-slot="{ errors }" name="categoryId"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-category"><span class="text-destructive">*</span> 分类</FieldLabel><Select :model-value="String(values.categoryId || '')" @update:model-value="setFieldValue('categoryId', Number($event))"><SelectTrigger id="product-category" :aria-invalid="errors.length > 0"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent><SelectItem v-for="item in activeCategories" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent></Select><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>SEO</FieldLegend><VeeField v-slot="{ componentField, errors }" name="slug"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-slug">Slug</FieldLabel><Input id="product-slug" v-bind="componentField" placeholder="留空则自动生成" :aria-invalid="errors.length > 0" @update:model-value="onSlug" /><FieldDescription>前台路径：/product/{{ values.slug || "slug" }}</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField }" name="subtitle"><Field><FieldLabel for="product-subtitle">副标题</FieldLabel><Input id="product-subtitle" v-bind="componentField" placeholder="用于 SEO 摘要，建议包含核心关键词" /></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>商品封面</FieldLegend><VeeField v-slot="{ componentField }" name="coverImage"><Field><FieldLabel for="product-cover">封面 URL</FieldLabel><div class="grid gap-2"><Input id="product-cover" v-bind="componentField" placeholder="/media/proxy/... 或外部图片 URL" /><Button type="button" variant="outline" @click="mediaPickerOpen = true">从媒体库选择</Button></div><img v-if="values.coverImage" :src="values.coverImage" alt="商品封面预览" class="aspect-video w-full rounded-md border object-cover" /></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>价格与购买规则</FieldLegend><VeeField v-slot="{ componentField, errors }" name="price"><Field :data-invalid="errors.length > 0"><FieldLabel><span class="text-destructive">*</span> 价格（元）</FieldLabel><div class="flex items-center gap-3"><Input v-bind="componentField" class="w-1/2" inputmode="decimal" :aria-invalid="errors.length > 0" /><span class="text-sm text-muted-foreground">价格预览 <span class="font-medium text-foreground">¥{{ pricePreview(values.price) }}</span></span></div><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><div v-if="values.deliveryType !== 'FIXED_CARD'" class="grid grid-cols-2 gap-4"><VeeField v-slot="{ componentField, errors }" name="minBuy"><Field :data-invalid="errors.length > 0"><FieldLabel><span class="text-destructive">*</span> 最小购买数</FieldLabel><Input v-bind="componentField" type="number" min="1" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField, errors }" name="maxBuy"><Field :data-invalid="errors.length > 0"><FieldLabel><span class="text-destructive">*</span> 最大购买数</FieldLabel><Input v-bind="componentField" type="number" min="1" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField></div><VeeField v-slot="{ componentField }" name="sort"><Field><FieldLabel>排序</FieldLabel><Input v-bind="componentField" type="number" min="0" /></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>发布设置</FieldLegend><VeeField name="status"><Field><FieldLabel>状态</FieldLabel><Select v-model="status"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent></Select></Field></VeeField></FieldSet>
          </FieldGroup>
        </aside>
      </div>
      <div class="flex items-center justify-end gap-2 border-t px-6 py-4"><Button type="button" variant="outline" :disabled="saving || loading" @click="goBack">取消</Button><Button type="submit" :disabled="saving || loading">{{ saving ? "保存中..." : loading ? "加载中..." : editing ? "保存商品" : "创建商品" }}</Button></div>
    </form>
    <MediaPickerDialog v-model:open="mediaPickerOpen" @select="setFieldValue('coverImage', $event)" />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { toast } from "vue-sonner";
import { InfoIcon } from "@lucide/vue";
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetCatalogAdminData, onGetProductAdminDetail, onSaveProduct } from "@/server/catalog/admin.telefunc";
import ProductRichTextEditor from "./ProductRichTextEditor.vue";
import { defaultProductForm, formToSaveInput, productDetailToForm, productFormSchema, slugifyProductName, type ProductForm } from "./product-form";

const props = defineProps<{ productId?: number }>();
const pageContext = usePageContext();
const basePath = `/${pageContext.routeParams.adminPath}`;
const listPath = `${basePath}/catalog/products`;
const cardManagementPath = `${basePath}/catalog/cards`;
const categories = ref<Array<{ id: number; name: string; status: string }>>([]);
const cardInventory = ref<{ available: number } | null>(null);
const saving = ref(false); const loading = ref(false); const error = ref<string | null>(null); const mediaPickerOpen = ref(false); const slugTouched = ref(Boolean(props.productId));
const { values, handleSubmit, resetForm, setFieldValue } = useForm<ProductForm>({ validationSchema: toTypedSchema(productFormSchema), initialValues: defaultProductForm(), keepValuesOnUnmount: true });
const activeCategories = computed(() => categories.value.filter((item) => item.status === "ACTIVE"));
const editing = computed(() => Boolean(props.productId));
const requiresPhysicalStock = computed(() => values.deliveryType === "MANUAL" || values.deliveryType === "EXPRESS");
function pricePreview(value: string) { const amount = Number(value); return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : "0.00"; }
const deliveryType = computed({ get: () => values.deliveryType, set: (value) => setFieldValue("deliveryType", value as ProductForm["deliveryType"]) });
const status = computed({ get: () => values.status, set: (value) => setFieldValue("status", value as ProductForm["status"]) });
const deliveryOptions = [{ value: "CARD_AUTO", label: "自动发货卡密", description: "从卡密库存中自动分配未售卡密。" }, { value: "FIXED_CARD", label: "固定内容自动发货", description: "每次支付后发送同一份固定内容，不使用卡密库存。" }, { value: "MANUAL", label: "手动发货", description: "支付后等待管理员在订单详情填写发货内容。" }, { value: "EXPRESS", label: "快递发货", description: "买家下单时填写收货信息，支付后管理员安排快递发货。" }] as const;
function onSlug() { slugTouched.value = true; }
watch(() => values.name, (name) => { if (!slugTouched.value && !props.productId) setFieldValue("slug", slugifyProductName(name)); });
watch(() => values.deliveryType, (value) => { if (value === "FIXED_CARD") { setFieldValue("minBuy", 1); setFieldValue("maxBuy", 1); } if ((value === "MANUAL" || value === "EXPRESS") && values.physicalStock === null) setFieldValue("physicalStock", 1); });
function goBack() { void navigate(listPath); }
async function load() { loading.value = true; error.value = null; try { const catalog = await runTelefunc(() => onGetCatalogAdminData(), { notifyError: false }); categories.value = catalog.categories; if (props.productId) { const detail = await runTelefunc(() => onGetProductAdminDetail({ id: props.productId! }), { notifyError: false }); resetForm({ values: productDetailToForm(detail.product) }); cardInventory.value = detail.cardInventory; } else resetForm({ values: defaultProductForm(activeCategories.value[0]?.id ?? null) }); } catch (cause) { error.value = userErrorMessage(cause, "无法读取商品信息。"); } finally { loading.value = false; } }
const submit = handleSubmit(async (form) => { saving.value = true; error.value = null; try { await runTelefunc(() => onSaveProduct(formToSaveInput(form)), { successMessage: props.productId ? "商品已保存。" : "商品已创建。" }); goBack(); } catch (cause) { error.value = userErrorMessage(cause); } finally { saving.value = false; } }, () => toast.error("请检查标记的必填项和输入格式。"));
onMounted(load);
</script>
