<template>
  <Dialog :open="open" @update:open="requestClose">
    <DialogContent class="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
      <DialogHeader class="border-b px-6 py-5"><DialogTitle>{{ editing ? "编辑商品" : mode === "quick" ? "快速添加商品" : "添加商品" }}</DialogTitle><DialogDescription>{{ mode === "quick" ? "填写必要信息即可创建商品草稿。" : "完整配置商品信息，金额按元输入。" }}</DialogDescription></DialogHeader>
      <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="submit">
        <div class="min-h-0 overflow-y-auto px-6 py-5">
          <div class="grid gap-6">
            <FieldSet class="gap-4">
              <FieldLegend>基本信息</FieldLegend><div class="grid gap-4 sm:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="name"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-name">商品名称</FieldLabel><Input id="product-name" v-bind="componentField" :aria-invalid="errors.length > 0" @update:model-value="onName" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ errors }" name="categoryId"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-category">分类</FieldLabel><Select :model-value="String(values.categoryId || '')" @update:model-value="setFieldValue('categoryId', Number($event))"><SelectTrigger id="product-category" :aria-invalid="errors.length > 0"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent><SelectItem v-for="item in activeCategories" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent></Select><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-if="mode === 'complete'" v-slot="{ componentField, errors }" name="slug"><Field :data-invalid="errors.length > 0"><FieldLabel for="product-slug">Slug</FieldLabel><Input id="product-slug" v-bind="componentField" :aria-invalid="errors.length > 0" @update:model-value="onSlug" /><FieldDescription>前台路径：/product/{{ values.slug || "slug" }}</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-if="mode === 'complete'" v-slot="{ componentField }" name="subtitle"><Field><FieldLabel for="product-subtitle">副标题</FieldLabel><Input id="product-subtitle" v-bind="componentField" /></Field></VeeField>
              </div>
            </FieldSet>
            <template v-if="mode === 'complete'">
              <FieldSet class="gap-4"><FieldLegend>商品媒体与详情</FieldLegend><VeeField v-slot="{ componentField }" name="coverImage"><Field><FieldLabel for="product-cover">封面 URL</FieldLabel><div class="flex gap-2"><Input id="product-cover" v-bind="componentField" placeholder="/media/proxy/... 或外部图片 URL" /><Button type="button" variant="outline" @click="mediaPickerOpen = true">从媒体库选择</Button></div><img v-if="values.coverImage" :src="values.coverImage" alt="商品封面预览" class="h-24 w-40 rounded-md border object-cover" /></Field></VeeField><VeeField name="description"><Field><FieldLabel for="product-description">商品详情</FieldLabel><ProductRichTextEditor :model-value="values.description" @update:model-value="setFieldValue('description', $event)" /></Field></VeeField></FieldSet>
              <FieldSet class="gap-4"><FieldLegend>价格与购买规则</FieldLegend><div class="grid gap-4 sm:grid-cols-4"><VeeField v-slot="{ componentField, errors }" name="price"><Field :data-invalid="errors.length > 0"><FieldLabel>价格（元）</FieldLabel><Input v-bind="componentField" inputmode="decimal" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField }" name="minBuy"><Field><FieldLabel>最小购买数</FieldLabel><Input v-bind="componentField" type="number" min="1" /></Field></VeeField><VeeField v-slot="{ componentField, errors }" name="maxBuy"><Field :data-invalid="errors.length > 0"><FieldLabel>最大购买数</FieldLabel><Input v-bind="componentField" type="number" min="1" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-slot="{ componentField }" name="sort"><Field><FieldLabel>排序</FieldLabel><Input v-bind="componentField" type="number" min="0" /></Field></VeeField></div></FieldSet>
              <FieldSet class="gap-4"><FieldLegend>发货与库存</FieldLegend><VeeField v-slot="{ errors }" name="deliveryType"><Field :data-invalid="errors.length > 0"><FieldLabel>发货方式</FieldLabel><RadioGroup v-model="deliveryType" class="grid gap-3 sm:grid-cols-2" :aria-invalid="errors.length > 0"><label v-for="option in deliveryOptions" :key="option.value" class="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"><RadioGroupItem :value="option.value" class="mt-1" /><span class="grid gap-1"><span class="text-sm font-medium">{{ option.label }}</span><span class="text-xs text-muted-foreground">{{ option.description }}</span></span></label></RadioGroup><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><Field v-if="values.deliveryType === 'CARD_AUTO' && values.id"><FieldLabel>卡密库存</FieldLabel><FieldDescription>可用卡密：{{ props.cardInventory?.available ?? 0 }} 条。卡密内容仅可在专用管理页查看和维护。</FieldDescription><Button as-child type="button" variant="outline" size="sm"><a :href="props.cardInventory?.managementPath">管理卡密</a></Button></Field><FieldDescription v-else-if="values.deliveryType === 'CARD_AUTO'">保存商品后，可前往卡密管理页导入或维护自动发货库存。</FieldDescription><VeeField v-if="values.deliveryType === 'FIXED_CARD'" v-slot="{ componentField, errors }" name="fixedDeliveryContent"><Field :data-invalid="errors.length > 0"><FieldLabel>固定交付内容</FieldLabel><Textarea v-bind="componentField" rows="3" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField><VeeField v-if="requiresPhysicalStock" v-slot="{ componentField }" name="physicalStock"><Field><FieldLabel>实物库存</FieldLabel><Input v-bind="componentField" type="number" min="0" /></Field></VeeField><VeeField v-if="mode === 'complete' && requiresPhysicalStock" v-slot="{ componentField }" name="manualDeliveryHint"><Field><FieldLabel>发货提示</FieldLabel><Textarea v-bind="componentField" rows="3" /></Field></VeeField></FieldSet>
              <FieldSet v-if="mode === 'complete'" class="gap-4"><FieldLegend>发布设置</FieldLegend><VeeField name="status"><Field><FieldLabel>状态</FieldLabel><Select v-model="status"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent></Select></Field></VeeField><VeeField v-slot="{ componentField }" name="purchaseNote"><Field><FieldLabel>购买说明</FieldLabel><Textarea v-bind="componentField" rows="3" /></Field></VeeField><Field orientation="horizontal"><FieldLabel for="visible-stock">前台展示库存</FieldLabel><Switch id="visible-stock" v-model="visibleStock" /></Field><Field orientation="horizontal"><FieldLabel for="contact-required">必须填写联系方式</FieldLabel><Switch id="contact-required" v-model="contactRequired" /></Field></FieldSet>
            </template>
          </div>
        </div><DialogFooter class="border-t bg-background px-6 py-4"><Button type="button" variant="outline" :disabled="saving || loadingDetail" @click="requestClose(true)">取消</Button><Button v-if="mode === 'quick'" type="button" variant="outline" :disabled="saving || loadingDetail" @click="mode = 'complete'">完整配置</Button><Button type="submit" :disabled="saving || loadingDetail">{{ saving ? "保存中..." : loadingDetail ? "加载中..." : mode === "quick" ? "创建草稿" : editing ? "保存商品" : "创建商品" }}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog><MediaPickerDialog v-model:open="mediaPickerOpen" @select="setFieldValue('coverImage', $event)" /><Dialog v-model:open="confirmOpen"><DialogContent class="sm:max-w-md"><DialogHeader><DialogTitle>放弃未保存的修改？</DialogTitle><DialogDescription>当前表单有未保存内容，关闭后这些修改将丢失。</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" @click="confirmOpen = false">继续编辑</Button><Button type="button" variant="destructive" @click="discardChanges">放弃修改</Button></DialogFooter></DialogContent></Dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { toTypedSchema } from "@vee-validate/zod";

import { Field as VeeField, useForm } from "vee-validate";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";
import ProductRichTextEditor from "./ProductRichTextEditor.vue";
import { defaultProductForm, formToSaveInput, productFormSchema, slugifyProductName, type ProductForm } from "./product-form";

type Category = { id: number; name: string; status: string };
const props = defineProps<{ open: boolean; categories: Category[]; detail?: ProductForm | null; cardInventory?: { available: number; managementPath: string } | null; saving?: boolean; loadingDetail?: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean]; save: [value: ReturnType<typeof formToSaveInput>, mode: "quick" | "complete"] }>();
const mode = ref<"quick" | "complete">("complete"); const mediaPickerOpen = ref(false); const confirmOpen = ref(false); const slugTouched = ref(false);
const { values, handleSubmit, resetForm, setFieldValue, meta } = useForm<ProductForm>({ validationSchema: toTypedSchema(productFormSchema), initialValues: defaultProductForm() });
const activeCategories = computed(() => props.categories.filter((item) => item.status === "ACTIVE"));
const deliveryOptions = [
  { value: "CARD_AUTO", label: "自动卡密", description: "从未售卡密库存自动分配。" },
  { value: "FIXED_CARD", label: "固定内容", description: "每次支付后发送同一份固定内容。" },
  { value: "MANUAL", label: "人工发货", description: "支付后由管理员填写发货结果。" },
  { value: "EXPRESS", label: "物流发货", description: "支付后由管理员安排物流。" },
] as const;
const requiresPhysicalStock = computed(() => values.deliveryType === "MANUAL" || values.deliveryType === "EXPRESS");
const editing = computed(() => Boolean(values.id));
const deliveryType = computed({ get: () => values.deliveryType, set: (v) => setFieldValue("deliveryType", v as ProductForm["deliveryType"]) });
const status = computed({ get: () => values.status, set: (v) => setFieldValue("status", v as ProductForm["status"]) });
const visibleStock = computed({ get: () => values.isVisibleStock, set: (v) => setFieldValue("isVisibleStock", v === true) });
const contactRequired = computed({ get: () => values.isContactRequired, set: (v) => setFieldValue("isContactRequired", v === true) });
function loadForm() { const next = props.detail ?? defaultProductForm(activeCategories.value[0]?.id ?? null); resetForm({ values: next }); mode.value = props.detail ? "complete" : "quick"; slugTouched.value = Boolean(props.detail?.slug); }
watch(() => props.open, (open) => { if (open && !props.loadingDetail) loadForm(); });
watch(() => props.detail, (detail) => { if (props.open && detail) loadForm(); });
function onName(payload: string | number) { const value = String(payload); setFieldValue("name", value); if (!slugTouched.value && !values.id) setFieldValue("slug", slugify(value)); }
function onSlug(payload: string | number) { slugTouched.value = true; setFieldValue("slug", String(payload)); }
function slugify(value: string) { return slugifyProductName(value); }
function requestClose(force = false) { if (force && meta.value.dirty) { confirmOpen.value = true; return; } emit("update:open", false); }
function discardChanges() { confirmOpen.value = false; emit("update:open", false); }
const submit = handleSubmit((form) => emit("save", formToSaveInput(form, mode.value === "quick"), mode.value));
</script>
