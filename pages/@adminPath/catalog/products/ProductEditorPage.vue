<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions><div class="flex items-center gap-2"><Button variant="outline" :disabled="saving" @click="goBack">返回商品列表</Button><Button type="submit" form="product-editor-form" :disabled="saving || loading">{{ saving ? "保存中..." : loading ? "加载中..." : editing ? "保存商品" : "创建商品" }}</Button></div></template>
    </AdminPageHeader>

    <form id="product-editor-form" class="border-t" novalidate @submit.prevent="submit">
      <div class="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,1fr)]">
        <FieldGroup class="gap-6">
          <FieldSet class="gap-4"><FieldLegend><span class="text-destructive">*</span> 商品名称</FieldLegend><VeeField v-slot="{ componentField, errors }" name="name"><Field :data-invalid="errors.length > 0"><Input id="product-name" v-bind="componentField" placeholder="例如：Pro 会员月卡" aria-label="商品名称" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField></FieldSet>
          <FieldSeparator />
          <FieldSet class="gap-4"><FieldLegend><span class="text-destructive">*</span> 商品详情</FieldLegend><VeeField v-slot="{ errors }" name="description"><Field :data-invalid="errors.length > 0"><ProductRichTextEditor :model-value="values.description" @update:model-value="setFieldValue('description', $event)" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField></FieldSet>
          <FieldSeparator />
          <FieldSet class="gap-4"><FieldLegend>购买须知</FieldLegend><VeeField v-slot="{ componentField }" name="purchaseNote"><Field><Textarea v-bind="componentField" rows="3" placeholder="例如：虚拟商品售出后不支持退款，请确认商品信息后购买" aria-label="购买须知" /></Field></VeeField></FieldSet>
          <FieldSeparator />
          <FieldSet v-if="isSupplierProduct" class="gap-2">
            <FieldLegend>履约方式</FieldLegend>
            <FieldDescription>供应商履约。供应商绑定、远程库存和成本限制由供应商管理模块维护。</FieldDescription>
          </FieldSet>
          <FieldSet v-else class="gap-4">
            <FieldLegend><span class="text-destructive">*</span> 发货方式</FieldLegend>
            <FieldDescription>{{ editing ? "商品创建后不能修改发货方式。价格、库存和购买限制由各 SKU 分别配置。" : "一个商品统一使用一种发货方式，具体价格、库存和购买限制由各 SKU 分别配置。" }}</FieldDescription>
            <RadioGroup :model-value="deliveryType" class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" :disabled="editing || saving || skuSaving || deliveryChanging" @update:model-value="changeDeliveryType">
              <label v-for="option in deliveryOptions" :key="option.value" class="flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5">
                <RadioGroupItem :value="option.value" class="mt-1" />
                <span class="grid gap-1"><span class="text-sm font-medium">{{ option.label }}</span><span class="text-xs text-muted-foreground">{{ option.description }}</span></span>
              </label>
            </RadioGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet class="gap-4">
            <div class="flex items-center justify-between gap-3"><FieldLegend>SKU 与价格</FieldLegend><Button v-if="!isSupplierProduct" type="button" variant="outline" size="sm" :disabled="saving || skuSaving" @click="addSku">添加 SKU</Button></div>
            <FieldDescription>{{ isSupplierProduct ? "可编辑本地展示名称、售价、排序和状态；供应商绑定与履约配置不可在此修改。" : "保存后以列表形式维护 SKU，减少重复表单空间；发货方式由上方商品设置统一控制。" }}</FieldDescription>
            <div class="overflow-x-auto rounded-lg border"><table v-if="skuDrafts.length" class="w-full text-sm"><thead class="border-b bg-muted/40 text-left"><tr><th class="p-3">SKU 名称</th><th class="p-3">价格（元）</th><th class="p-3">购买范围</th><th class="p-3">库存/内容</th><th class="p-3">状态</th><th class="p-3">操作</th></tr></thead><tbody><tr v-for="sku in skuDrafts" :key="sku.id ?? sku.clientKey" class="border-b last:border-0"><td class="p-3"><Input v-model="sku.name" /></td><td class="p-3"><Input v-model="sku.price" inputmode="decimal" /></td><td class="p-3"><div v-if="!isSupplierProduct" class="flex min-w-36 items-center gap-2"><Input v-model.number="sku.minBuy" type="number" min="1" :disabled="deliveryType === 'FIXED_CARD'" /><span>-</span><Input v-model.number="sku.maxBuy" type="number" min="1" :disabled="deliveryType === 'FIXED_CARD'" /></div><span v-else class="text-muted-foreground">供应商配置</span></td><td class="min-w-52 p-3"><template v-if="isSupplierProduct"><span class="text-muted-foreground">供应商履约</span></template><Input v-else-if="deliveryType === 'MANUAL' || deliveryType === 'EXPRESS'" :model-value="sku.physicalStock ?? 0" type="number" min="0" @update:model-value="sku.physicalStock = Number($event)" /><Textarea v-else-if="deliveryType === 'FIXED_CARD'" v-model="sku.fixedDeliveryContent" rows="1" /><span v-else class="text-muted-foreground">卡密库存</span></td><td class="p-3"><Select v-model="sku.status"><SelectTrigger class="min-w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="INACTIVE">停用</SelectItem></SelectContent></Select></td><td class="whitespace-nowrap p-3"><div class="flex gap-2"><Button v-if="editing && !isSupplierProduct" type="button" size="sm" :disabled="skuSaving" @click="saveSku(sku)">{{ sku.id ? '保存' : '创建' }}</Button><Button v-if="editing && sku.id && !isSupplierProduct" type="button" size="sm" variant="destructive" :disabled="skuSaving" @click="removeSku(sku)">删除</Button><Button v-if="!editing" type="button" size="sm" variant="outline" :disabled="saving" @click="discardSku(sku)">移除</Button></div></td></tr></tbody></table><p v-else class="p-6 text-center text-sm text-muted-foreground">暂无 SKU，请点击“添加 SKU”。</p></div>
          </FieldSet>
        </FieldGroup>

        <aside class="lg:border-l lg:pl-8">
          <FieldGroup class="gap-6">
            <FieldSet class="gap-4"><FieldLegend>商品分类</FieldLegend><VeeField v-slot="{ errors }" name="categoryId"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-category"><span class="text-destructive">*</span> 分类</FieldLabel><Select :model-value="String(values.categoryId || '')" @update:model-value="setFieldValue('categoryId', Number($event))"><SelectTrigger id="product-category" :aria-invalid="errors.length > 0"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent><SelectItem v-for="item in activeCategories" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent></Select><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField }" name="sort"><Field><FieldLabel>商品排序</FieldLabel><Input v-bind="componentField" type="number" min="0" /><FieldDescription>用于商品列表中的显示顺序。</FieldDescription></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>SEO</FieldLegend><VeeField v-slot="{ componentField, errors }" name="slug"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-slug">Slug</FieldLabel><Input id="product-slug" v-bind="componentField" placeholder="留空则自动生成" :aria-invalid="errors.length > 0" @update:model-value="onSlug" /><FieldDescription>前台路径：/product/{{ values.slug || "slug" }}</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField }" name="subtitle"><Field><FieldLabel for="product-subtitle">副标题</FieldLabel><Input id="product-subtitle" v-bind="componentField" placeholder="用于 SEO 摘要，建议包含核心关键词" /></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>商品封面</FieldLegend><VeeField v-slot="{ componentField }" name="coverImage"><Field><FieldLabel for="product-cover">封面 URL</FieldLabel><div class="grid gap-2"><Input id="product-cover" v-bind="componentField" placeholder="/media/proxy/... 或外部图片 URL" /><Button type="button" variant="outline" @click="mediaPickerOpen = true">从媒体库选择</Button></div><img v-if="values.coverImage" :src="values.coverImage" alt="商品封面预览" class="aspect-video w-full rounded-md border object-cover" /></Field></VeeField></FieldSet>
            <FieldSeparator />
            <FieldSet class="gap-4"><FieldLegend>发布设置</FieldLegend><VeeField name="status"><Field><FieldLabel>状态</FieldLabel><Select v-model="status"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent></Select></Field></VeeField></FieldSet>
          </FieldGroup>
        </aside>
      </div>
      <div class="flex items-center justify-end gap-2 border-t px-6 py-4"><Button type="button" variant="outline" :disabled="saving || loading" @click="goBack">取消</Button><Button type="submit" :disabled="saving || loading">{{ saving ? "保存中..." : loading ? "加载中..." : editing ? "保存商品" : "创建商品" }}</Button></div>
    </form>

    <MediaPickerDialog v-model:open="mediaPickerOpen" @select="setFieldValue('coverImage', $event)" />

    <Dialog v-model:open="deliveryChangeDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>切换发货方式？</DialogTitle>
          <DialogDescription>当前 SKU 的名称、价格、库存、购买限制和固定发货内容都会被清空并重置为草稿。已保存 SKU 会保留记录以确保历史订单和卡密关联不受影响；此操作不可恢复。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="deliveryChanging" @click="deliveryChangeDialogOpen = false">取消</Button>
          <Button type="button" variant="destructive" :disabled="deliveryChanging" @click="confirmDeliveryTypeChange">{{ deliveryChanging ? "处理中..." : "清空并切换" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { toast } from "vue-sonner";

import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { formatCentsAsYuan } from "@/lib/payment-utils";
import { runTelefunc } from "@/lib/telefunc-client";
import { onDeleteProductSku, onGetCatalogAdminData, onGetProductAdminDetail, onSaveProduct, onSaveProductSku, onSaveSupplierProductPresentation } from "@/server/catalog/admin.telefunc";
import ProductRichTextEditor from "./ProductRichTextEditor.vue";
import { defaultProductForm, formToSaveInput, productDetailToForm, productFormSchema, slugifyProductName, type ProductDeliveryType, type ProductForm } from "./product-form";

const props = defineProps<{ productId?: number }>();
const pageContext = usePageContext();
const basePath = `/${pageContext.routeParams.adminPath}`;
const listPath = `${basePath}/catalog/products`;

const categories = ref<Array<{ id: number; name: string; status: string }>>([]);
const cardInventory = ref<{ available: number } | null>(null);
type ProductSkuSaveInput = { id?: number; productId: number; name: string; price: string; status: "ACTIVE" | "INACTIVE"; deliveryType: ProductDeliveryType; fixedDeliveryContent?: string; physicalStock: number | null; minBuy: number; maxBuy: number; sort: number };
type SkuDraft = Omit<ProductSkuSaveInput, "deliveryType"> & { fulfillmentSource?: "LOCAL" | "SUPPLIER"; deliveryType: ProductDeliveryType | "SUPPLIER"; clientKey: string; fixedDeliveryContent: string };
const skuDrafts = ref<SkuDraft[]>([]); const skuSaving = ref(false);
const saving = ref(false); const loading = ref(false); const mediaPickerOpen = ref(false); const slugTouched = ref(Boolean(props.productId));
const { values, handleSubmit, resetForm, setFieldValue } = useForm<ProductForm>({ validationSchema: toTypedSchema(productFormSchema), initialValues: defaultProductForm(), keepValuesOnUnmount: true });
const activeCategories = computed(() => categories.value.filter((item) => item.status === "ACTIVE"));
const editing = computed(() => Boolean(props.productId));
const isSupplierProduct = computed(() => skuDrafts.value.length > 0 && skuDrafts.value.every((sku) => sku.fulfillmentSource === "SUPPLIER"));

const status = computed({ get: () => values.status, set: (value) => setFieldValue("status", value as ProductForm["status"]) });
const deliveryType = ref<ProductDeliveryType>("CARD_AUTO");
const deliveryChangeDialogOpen = ref(false);
const deliveryChanging = ref(false);
const pendingDeliveryType = ref<ProductDeliveryType | null>(null);
const deliveryOptions = [{ value: "CARD_AUTO", label: "自动发货卡密", description: "从卡密库存中自动分配未售卡密。" }, { value: "FIXED_CARD", label: "固定内容自动发货", description: "每次支付后发送同一份固定内容，不使用卡密库存。" }, { value: "MANUAL", label: "手动发货", description: "支付后等待管理员在订单详情填写发货内容。" }, { value: "EXPRESS", label: "快递发货", description: "买家下单时填写收货信息，支付后管理员安排快递发货。" }] as const;
function onSlug() { slugTouched.value = true; }
watch(() => values.name, (name) => { if (!slugTouched.value && !props.productId) setFieldValue("slug", slugifyProductName(name)); });

function goBack() { void navigate(listPath); }
function addSku() { skuDrafts.value.push({ clientKey: crypto.randomUUID(), productId: props.productId ?? 0, name: `新规格${skuDrafts.value.length + 1}`, price: "0.01", status: "ACTIVE", deliveryType: deliveryType.value, fixedDeliveryContent: "", physicalStock: null, minBuy: 1, maxBuy: 1, sort: skuDrafts.value.length }); }
function hasConfiguredSku() {
  return skuDrafts.value.some((sku) => Boolean(sku.id) || !/^新规格\d*$/.test(sku.name.trim()) || sku.price !== "0.01" || sku.fixedDeliveryContent.trim() !== "" || sku.physicalStock !== null || sku.minBuy !== 1 || sku.maxBuy !== 1);
}

function changeDeliveryType(next: unknown) {
  if (typeof next !== "string") return;
  const target = next as ProductDeliveryType;
  if (target === deliveryType.value) return;
  if (hasConfiguredSku()) {
    pendingDeliveryType.value = target;
    deliveryChangeDialogOpen.value = true;
    return;
  }
  applyDeliveryType(target);
}

function applyDeliveryType(next: ProductDeliveryType) {
  deliveryType.value = next;
  skuDrafts.value.forEach((sku) => { sku.deliveryType = next; });
  if (!skuDrafts.value.length) addSku();
}

function confirmDeliveryTypeChange() {
  const next = pendingDeliveryType.value;
  if (!next) return;
  deliveryChanging.value = true;
  try {
    // 保留 ID，使已有订单/卡密继续引用原记录；保存商品时会覆盖这些 SKU 的全部可配置字段。
    skuDrafts.value.forEach((sku, index) => {
      sku.name = `新规格${index + 1}`;
      sku.price = "0.01";
      sku.status = "ACTIVE";
      sku.deliveryType = next;
      sku.fixedDeliveryContent = "";
      sku.physicalStock = next === "MANUAL" || next === "EXPRESS" ? 1 : null;
      sku.minBuy = 1;
      sku.maxBuy = 1;
    });
    applyDeliveryType(next);
    pendingDeliveryType.value = null;
    deliveryChangeDialogOpen.value = false;
    toast.success("SKU 配置已清空，请重新填写。");
  } finally {
    deliveryChanging.value = false;
  }
}
async function saveSku(sku: SkuDraft) { if (!props.productId) return; skuSaving.value = true; try { const input: ProductSkuSaveInput = { id: sku.id, productId: props.productId, name: sku.name, price: sku.price, status: sku.status, deliveryType: deliveryType.value, fixedDeliveryContent: sku.fixedDeliveryContent, physicalStock: sku.physicalStock, minBuy: sku.minBuy, maxBuy: sku.maxBuy, sort: sku.sort }; const saved = await runTelefunc(() => onSaveProductSku(input), { successMessage: sku.id ? "SKU 已保存。" : "SKU 已创建。" }); Object.assign(sku, { ...saved, clientKey: sku.clientKey, price: formatCentsAsYuan(saved.price), fixedDeliveryContent: saved.fixedDeliveryContent ?? "" }); } catch { /* runTelefunc 已显示统一错误提示。 */ } finally { skuSaving.value = false; } }
async function removeSku(sku: SkuDraft) { if (!sku.id) return; skuSaving.value = true; try { await runTelefunc(() => onDeleteProductSku({ id: sku.id! }), { successMessage: "SKU 已删除。" }); skuDrafts.value = skuDrafts.value.filter((item) => item !== sku); } catch { /* runTelefunc 已显示统一错误提示。 */ } finally { skuSaving.value = false; } }
function discardSku(sku: SkuDraft) { skuDrafts.value = skuDrafts.value.filter((item) => item !== sku); }
async function load() { loading.value = true; try { const catalog = await runTelefunc(() => onGetCatalogAdminData()); categories.value = catalog.categories; if (props.productId) { const detail = await runTelefunc(() => onGetProductAdminDetail({ id: props.productId! })); resetForm({ values: productDetailToForm(detail.product) }); cardInventory.value = detail.cardInventory; deliveryType.value = detail.skus[0]?.deliveryType === "SUPPLIER" ? "CARD_AUTO" : detail.skus[0]?.deliveryType ?? "CARD_AUTO"; skuDrafts.value = detail.skus.map((sku) => ({ ...sku, productId: props.productId!, clientKey: `sku-${sku.id}`, fixedDeliveryContent: sku.fixedDeliveryContent ?? "" })); } else { resetForm({ values: defaultProductForm(activeCategories.value[0]?.id ?? null) }); deliveryType.value = "CARD_AUTO"; skuDrafts.value = []; addSku(); } } catch { /* runTelefunc 已显示统一错误提示。 */ } finally { loading.value = false; } }
const submit = handleSubmit(async (form) => { saving.value = true; try { if (isSupplierProduct.value && props.productId) {
      await runTelefunc(() => onSaveSupplierProductPresentation({ id: props.productId!, categoryId: form.categoryId || null, name: form.name, slug: form.slug, subtitle: form.subtitle, coverImage: form.coverImage, description: form.description, purchaseNote: form.purchaseNote, status: form.status, sort: form.sort, skus: skuDrafts.value.map((sku) => ({ id: sku.id!, name: sku.name, price: sku.price, status: sku.status, sort: sku.sort })) }), { successMessage: "供应商商品已保存。" });
    } else {
      await runTelefunc(() => onSaveProduct(formToSaveInput(form, skuDrafts.value.map(({ id, productId: _productId, clientKey: _clientKey, fulfillmentSource: _fulfillmentSource, ...sku }) => ({ ...sku, deliveryType: deliveryType.value, ...(editing.value && id ? { id } : {}) })), deliveryType.value)), { successMessage: props.productId ? "商品已保存。" : "商品已创建。" });
    } goBack(); } catch { /* runTelefunc 已显示统一错误提示。 */ } finally { saving.value = false; } }, () => toast.error("请检查标记的必填项和输入格式。"));
onMounted(load);
</script>
