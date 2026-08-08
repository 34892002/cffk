<template>
  <section class="flex w-full flex-col gap-8">
    <AdminPageHeader />

    <Alert v-if="error" variant="destructive">
      <AlertTitle>操作未完成</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <AdminDataTable :columns="columns" :rows="paginatedProducts" row-key="id">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="query" class="h-8 w-60" placeholder="搜索商品名称或 Slug" />
          <Select v-model="statusFilter">
            <SelectTrigger size="sm" class="min-w-28" aria-label="按状态筛选"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadCatalog"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
          <Button size="sm" @click="openCreate"><PlusIcon />添加商品</Button>
        </div>
      </template>
      <template #cell-name="{ value }"><span class="font-medium">{{ value }}</span></template>
      <template #cell-slug="{ value }"><span class="font-mono text-xs">{{ value }}</span></template>
      <template #cell-price="{ row }"><span class="whitespace-nowrap">{{ formatAmount(row.price) }}</span></template>
      <template #cell-delivery="{ row }"><span class="whitespace-nowrap text-sm text-muted-foreground">{{ deliveryLabel(row.deliveryType) }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'ACTIVE' ? 'secondary' : 'outline'">{{ productStatusLabel(row.status) }}</Badge></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="editProduct(row)">编辑</Button><Button variant="ghost" size="sm" @click="setProductStatus(row.id, row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')">{{ row.status === "ACTIVE" ? "下架" : "上架" }}</Button></template>
      <template #pagination><Pagination :total="filteredProducts.length" :page="currentPage" :page-size="pageSize" @update:page="currentPage = $event" @update:page-size="pageSize = $event" /></template>
    </AdminDataTable>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader class="border-b px-6 py-5 pr-8">
          <DialogTitle class="text-lg font-semibold">{{ productForm.id ? "编辑商品" : "新建商品" }}</DialogTitle>
          <DialogDescription>金额以分保存，前台会自动按人民币显示。</DialogDescription>
        </DialogHeader>
        <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" @submit.prevent="saveProduct">
          <div class="min-h-0 overflow-y-auto px-6 py-5">
            <div class="grid gap-4">
              <label class="grid gap-2 text-sm font-medium">名称<Input v-model="productForm.name" required /></label>
              <label class="grid gap-2 text-sm font-medium">Slug<Input v-model="productForm.slug" required placeholder="license-key" /></label>
              <label class="grid gap-2 text-sm font-medium">副标题<Input v-model="productForm.subtitle" /></label>
              <label class="grid gap-2 text-sm font-medium">详细描述<Textarea v-model="productForm.description" rows="3" class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <label class="grid gap-2 text-sm font-medium">分类
                <Select :model-value="productForm.categoryId === null ? undefined : String(productForm.categoryId)" @update:model-value="productForm.categoryId = Number($event)">
                  <SelectTrigger class="h-9"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent><SelectItem v-for="item in catalog.categories.filter((item) => item.status === 'ACTIVE')" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent>
                </Select>
              </label>
              <div class="grid grid-cols-2 gap-3"><label class="grid gap-2 text-sm font-medium">价格（分）<Input v-model.number="productForm.price" type="number" min="0" required /></label><label class="grid gap-2 text-sm font-medium">排序<Input v-model.number="productForm.sort" type="number" min="0" required /></label></div>
              <label class="grid gap-2 text-sm font-medium">发货方式
                <Select v-model="productForm.deliveryType"><SelectTrigger class="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CARD_AUTO">自动卡密</SelectItem><SelectItem value="FIXED_CARD">固定内容</SelectItem><SelectItem value="MANUAL">人工发货</SelectItem><SelectItem value="EXPRESS">物流发货</SelectItem></SelectContent></Select>
              </label>
              <label v-if="productForm.deliveryType === 'FIXED_CARD'" class="grid gap-2 text-sm font-medium">固定交付内容<Textarea v-model="productForm.fixedDeliveryContent" rows="3" class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <label v-if="requiresPhysicalStock" class="grid gap-2 text-sm font-medium">发货提示<Textarea v-model="productForm.manualDeliveryHint" rows="3" class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <label class="grid gap-2 text-sm font-medium">购买说明<Textarea v-model="productForm.purchaseNote" rows="3" class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <label v-if="requiresPhysicalStock" class="grid gap-2 text-sm font-medium">实物库存<Input :model-value="productForm.physicalStock ?? ''" type="number" min="0" @update:model-value="setPhysicalStock" /></label>
              <div class="grid grid-cols-2 gap-3"><label class="grid gap-2 text-sm font-medium">最小购买数<Input v-model.number="productForm.minBuy" type="number" min="1" required /></label><label class="grid gap-2 text-sm font-medium">最大购买数<Input v-model.number="productForm.maxBuy" type="number" min="1" required /></label></div>
              <label class="grid gap-2 text-sm font-medium">上架状态
                <Select v-model="productForm.status"><SelectTrigger class="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent></Select>
              </label>
              <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>下单时必须填写联系方式</span><Switch v-model="productForm.isContactRequired" /></label><label class="flex items-center justify-between gap-3 text-sm font-medium"><span>前台展示库存</span><Switch v-model="productForm.isVisibleStock" /></label>
            </div>
          </div>
          <DialogFooter class="flex-row justify-end gap-2 border-t bg-background px-6 py-4"><DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : productForm.id ? "保存商品" : "创建商品" }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { PlusIcon, RefreshCwIcon } from "@lucide/vue";

import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetCatalogAdminData, onSaveProduct, onSetProductStatus } from "@/server/catalog/admin.telefunc";

type Catalog = Awaited<ReturnType<typeof onGetCatalogAdminData>>;

type Product = Catalog["products"][number];
const columns: AdminTableColumn<Product>[] = [
  { key: "name", label: "商品名称" },
  { key: "slug", label: "Slug" },
  { key: "price", label: "价格" },
  { key: "delivery", label: "发货" },
  { key: "status", label: "状态" },
];

const catalog = reactive<Catalog>({ categories: [], products: [] });
const loading = ref(false);
const saving = ref(false);
const query = ref("");
const statusFilter = ref<"ALL" | Product["status"]>("ALL");
const currentPage = ref(1);
const pageSize = ref(10);
const dialogOpen = ref(false);
const error = ref<string | null>(null);

const productForm = reactive({ id: undefined as number | undefined, categoryId: null as number | null, name: "", slug: "", subtitle: "", description: "", fixedDeliveryContent: "", manualDeliveryHint: "", purchaseNote: "", isVisibleStock: true, isContactRequired: true, price: 0, status: "DRAFT" as Product["status"], deliveryType: "CARD_AUTO" as Product["deliveryType"], physicalStock: null as number | null, minBuy: 1, maxBuy: 1, sort: 0 });
const requiresPhysicalStock = computed(() => productForm.deliveryType === "MANUAL" || productForm.deliveryType === "EXPRESS");
const filteredProducts = computed(() => {
  const value = query.value.trim().toLowerCase();
  return catalog.products.filter((item) => {
    const matchesQuery = !value || item.name.toLowerCase().includes(value) || item.slug.toLowerCase().includes(value);
    return matchesQuery && (statusFilter.value === "ALL" || item.status === statusFilter.value);
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredProducts.value.length / pageSize.value)));
const paginatedProducts = computed(() => filteredProducts.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value));

onMounted(loadCatalog);
watch([query, statusFilter, pageSize], () => { currentPage.value = 1; });
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages; });

async function loadCatalog() {
  loading.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onGetCatalogAdminData(), { notifyError: false });
    catalog.categories = result.categories;
    catalog.products = result.products;
    if (!productForm.id && productForm.categoryId === null) productForm.categoryId = defaultCategoryId();
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function saveProduct() {
  saving.value = true;
  error.value = null;
  try { await runTelefunc(() => onSaveProduct({ ...productForm, physicalStock: requiresPhysicalStock.value ? productForm.physicalStock : null }), { notifyError: false }); resetProductForm(); await loadCatalog(); } catch (cause) { error.value = userErrorMessage(cause); } finally { saving.value = false; }
}
async function setProductStatus(id: number, status: Product["status"]) {
  error.value = null;
  try { await runTelefunc(() => onSetProductStatus({ id, status }), { notifyError: false }); await loadCatalog(); } catch (cause) { error.value = userErrorMessage(cause); }
}
function defaultCategoryId() { return catalog.categories.find((item) => item.slug === "default" && item.status === "ACTIVE")?.id ?? null; }
function openCreate() { resetProductForm(); dialogOpen.value = true; }
function editProduct(item: Product) { Object.assign(productForm, { id: item.id, categoryId: item.categoryId, name: item.name, slug: item.slug, subtitle: item.subtitle ?? "", description: item.description ?? "", fixedDeliveryContent: item.fixedDeliveryContent ?? "", manualDeliveryHint: item.manualDeliveryHint ?? "", purchaseNote: item.purchaseNote ?? "", isVisibleStock: item.isVisibleStock, isContactRequired: item.isContactRequired, price: item.price, status: item.status, deliveryType: item.deliveryType, physicalStock: item.physicalStock, minBuy: item.minBuy, maxBuy: item.maxBuy, sort: item.sort }); dialogOpen.value = true; }
function resetProductForm() { Object.assign(productForm, { id: undefined, categoryId: defaultCategoryId(), name: "", slug: "", subtitle: "", description: "", fixedDeliveryContent: "", manualDeliveryHint: "", purchaseNote: "", isVisibleStock: true, isContactRequired: true, price: 0, status: "DRAFT", deliveryType: "CARD_AUTO", physicalStock: null, minBuy: 1, maxBuy: 1, sort: 0 }); }
function setPhysicalStock(value: string | number) { productForm.physicalStock = value === "" ? null : Number(value); }
function formatAmount(amount: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100); }
function deliveryLabel(value: Product["deliveryType"]) { return { CARD_AUTO: "自动卡密", FIXED_CARD: "固定内容", MANUAL: "人工发货", EXPRESS: "物流发货" }[value]; }
function productStatusLabel(value: Product["status"]) { return { DRAFT: "草稿", ACTIVE: "上架", INACTIVE: "下架" }[value]; }

</script>
