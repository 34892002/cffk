<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="w-[calc(100%-2rem)] max-w-3xl p-0 sm:w-[calc(100%-4rem)]" @interact-outside.prevent>
      <DialogHeader class="border-b px-6 py-5">
        <DialogTitle>快速编辑商品</DialogTitle>
        <DialogDescription>修改商品名称、分类、Slug、价格、副标题、封面和购买数量。</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-6 px-6 py-5" novalidate @submit.prevent="submit">
        <FieldGroup>
          <Field>
            <FieldLabel for="quick-product-name">商品名称</FieldLabel>
            <Input id="quick-product-name" v-model="form.name" required />
          </Field>
          <Field>
            <FieldLabel for="quick-product-category">分类</FieldLabel>
            <Select :model-value="String(form.categoryId)" @update:model-value="form.categoryId = Number($event)">
              <SelectTrigger id="quick-product-category"><SelectValue placeholder="选择分类" /></SelectTrigger>
              <SelectContent><SelectItem v-for="category in activeCategories" :key="category.id" :value="String(category.id)">{{ category.name }}</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel for="quick-product-slug">Slug</FieldLabel>
            <Input id="quick-product-slug" v-model="form.slug" required @update:model-value="slugTouched = true" />
            <FieldDescription>前台路径：/product/{{ form.slug || "slug" }}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel for="quick-product-subtitle">副标题</FieldLabel>
            <Input id="quick-product-subtitle" v-model="form.subtitle" placeholder="用于 SEO 摘要，建议包含核心关键词" />
          </Field>
          <Field>
            <FieldLabel for="quick-product-cover">封面 URL</FieldLabel>
            <div class="flex gap-2">
              <Input id="quick-product-cover" v-model="form.coverImage" placeholder="/media/proxy/... 或外部图片 URL" />
              <Button type="button" variant="outline" @click="mediaPickerOpen = true">从媒体库选择</Button>
            </div>
          </Field>
          <div class="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel for="quick-product-price">价格（元）</FieldLabel>
              <Input id="quick-product-price" v-model="form.price" inputmode="decimal" required />
            </Field>
            <Field v-if="form.deliveryType !== 'FIXED_CARD'">
              <FieldLabel for="quick-product-min-buy">最小购买数</FieldLabel>
              <Input id="quick-product-min-buy" v-model.number="form.minBuy" type="number" min="1" required />
            </Field>
            <Field v-if="form.deliveryType !== 'FIXED_CARD'">
              <FieldLabel for="quick-product-max-buy">最大购买数</FieldLabel>
              <Input id="quick-product-max-buy" v-model.number="form.maxBuy" type="number" min="1" required />
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="saving" @click="emit('update:open', false)">取消</Button>
          <Button type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存修改" }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <MediaPickerDialog v-model:open="mediaPickerOpen" @select="form.coverImage = $event" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";
import { formToSaveInput, slugifyProductName, type ProductForm } from "./product-form";

type Category = { id: number; name: string; status: string };
const props = defineProps<{ open: boolean; categories: Category[]; product: ProductForm | null; saving?: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean]; save: [value: ReturnType<typeof formToSaveInput>] }>();
const mediaPickerOpen = ref(false);
const slugTouched = ref(false);
let loadingProduct = false;
const form = reactive<ProductForm>({} as ProductForm);
const activeCategories = computed(() => props.categories.filter((category) => category.status === "ACTIVE"));

watch(() => props.product, (product) => {
  if (!product) return;
  loadingProduct = true;
  Object.assign(form, product);
  loadingProduct = false;
  slugTouched.value = false;
}, { immediate: true });
watch(() => form.name, (name) => {
  if (!loadingProduct && !slugTouched.value) form.slug = slugifyProductName(name);
});
function submit() {
  if (!form.name.trim() || !form.slug.trim() || !form.price.trim() || !Number.isInteger(Number(form.categoryId))) {
    toast.error("请填写商品名称、分类、Slug 和价格。");
    return;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
    toast.error("Slug 只能包含小写英文、数字和连字符。");
    return;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(form.price) || Number(form.price) <= 0) {
    toast.error("请输入有效价格。");
    return;
  }
  if (form.deliveryType !== "FIXED_CARD" && (!Number.isInteger(form.minBuy) || !Number.isInteger(form.maxBuy) || form.minBuy < 1 || form.maxBuy < form.minBuy)) {
    toast.error("购买数量必须为正整数，且最大购买数不能小于最小购买数。");
    return;
  }
  emit("save", formToSaveInput({ ...form }));
}
</script>
