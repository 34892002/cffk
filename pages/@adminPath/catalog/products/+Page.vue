<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader /><Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
    <AdminDataTable :columns="columns" :rows="catalog.items" row-key="id" empty-text="暂无符合条件的商品。"><template #toolbar><div class="flex flex-wrap items-center gap-2"><Input v-model="draftKeyword" class="h-8 w-60" placeholder="搜索商品名称或 Slug" @keyup.enter="search" /><Select :model-value="draftCategoryId ? String(draftCategoryId) : 'ALL'" @update:model-value="draftCategoryId = $event === 'ALL' ? undefined : Number($event)"><SelectTrigger size="sm" class="w-32 shrink-0"><SelectValue placeholder="全部分类" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部分类</SelectItem><SelectItem v-for="category in catalog.categories" :key="category.id" :value="String(category.id)">{{ category.name }}</SelectItem></SelectContent></Select><Select :model-value="filters.status || 'ALL'" @update:model-value="filters.status = $event === 'ALL' ? undefined : $event as ProductStatus"><SelectTrigger size="sm" class="w-28 shrink-0"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">上架</SelectItem><SelectItem value="INACTIVE">下架</SelectItem></SelectContent></Select><Button size="sm" @click="search">查询</Button><Button variant="outline" size="sm" @click="resetFilters">重置</Button></div><div class="flex gap-2"><Button variant="outline" size="sm" :disabled="loading" @click="loadCatalog"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button><ButtonGroup><Button variant="outline" size="sm" @click="openQuick">快速添加</Button><Button variant="outline" size="sm" @click="openCreate">添加商品</Button></ButtonGroup></div></template><template #cell-name="{ value }"><span class="font-medium">{{ value }}</span></template><template #cell-slug="{ value }"><span class="font-mono text-xs">{{ value }}</span></template><template #cell-categoryName="{ value }">{{ value || "-" }}</template><template #cell-price="{ row }">¥{{ row.price }}</template><template #cell-deliveryType="{ row }">{{ deliveryLabel(row.deliveryType) }}</template><template #cell-status="{ row }"><Badge :variant="row.status === 'ACTIVE' ? 'default' : 'secondary'">{{ statusLabel(row.status) }}</Badge></template><template #actions="{ row }"><Button variant="ghost" size="sm" @click="openEdit(row.id)">快速编辑</Button><Button variant="ghost" size="sm" @click="editProduct(row.id)">编辑</Button><Button variant="ghost" size="sm" @click="setProductStatus(row.id, row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')">{{ row.status === "ACTIVE" ? "下架" : "上架" }}</Button><Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="requestDeleteProduct(row)">删除</Button></template><template #pagination><Pagination :total="catalog.total" :page="catalog.page" :page-size="catalog.pageSize" :page-size-options="[10, 20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template></AdminDataTable>

    <Dialog v-model:open="deleteDialogOpen"><DialogContent class="max-w-md"><DialogHeader><DialogTitle>删除商品？</DialogTitle><DialogDescription>“{{ productToDelete?.name }}”将被永久删除。已有订单或卡密记录的商品不能删除，请改为下架保留历史记录。</DialogDescription></DialogHeader><DialogFooter><DialogClose as-child><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" :disabled="deleting" @click="deleteProduct">{{ deleting ? "删除中..." : "确认删除" }}</Button></DialogFooter></DialogContent></Dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { RefreshCwIcon } from "@lucide/vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";


import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onDeleteProduct, onGetCatalogAdminData, onSetProductStatus } from "@/server/catalog/admin.telefunc";


type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE"; type Catalog = Awaited<ReturnType<typeof onGetCatalogAdminData>>; type Product = Catalog["items"][number];
const columns: AdminTableColumn<Product>[] = [{ key: "name", label: "商品名称" }, { key: "categoryName", label: "分类" }, { key: "slug", label: "Slug" }, { key: "price", label: "价格" }, { key: "deliveryType", label: "发货方式" }, { key: "status", label: "状态" }];
const pageContext = usePageContext();
const productsPath = computed(() => `/${pageContext.routeParams.adminPath}/catalog/products`);
const catalog = reactive<Catalog>({ items: [], total: 0, page: 1, pageSize: 10, categories: [] }); const filters = reactive<{ keyword?: string; categoryId?: number; status?: ProductStatus }>({}); const draftKeyword = ref(""); const draftCategoryId = ref<number | undefined>(); const loading = ref(false); const deleting = ref(false); const error = ref<string | null>(null); const catalogLoaded = ref(false); const deleteDialogOpen = ref(false); const productToDelete = ref<Product | null>(null);
onMounted(loadCatalog);
async function loadCatalog() { loading.value = true; error.value = null; try { const result = await runTelefunc(() => onGetCatalogAdminData({ ...filters, page: catalog.page, pageSize: catalog.pageSize }), { notifyError: catalogLoaded.value }); Object.assign(catalog, result); catalogLoaded.value = true; } catch (cause) { if (!catalogLoaded.value) error.value = userErrorMessage(cause); } finally { loading.value = false; } }
function search() { filters.keyword = draftKeyword.value.trim() || undefined; filters.categoryId = draftCategoryId.value; catalog.page = 1; loadCatalog(); } function resetFilters() { draftKeyword.value = ""; draftCategoryId.value = undefined; filters.keyword = undefined; filters.categoryId = undefined; filters.status = undefined; catalog.page = 1; loadCatalog(); } function changePage(page: number) { catalog.page = page; loadCatalog(); } function changePageSize(size: number) { catalog.pageSize = size; catalog.page = 1; loadCatalog(); }
function openQuick() { void navigate(`${productsPath.value}/new`); }
function openEdit(id: number) { void navigate(`${productsPath.value}/${id}`); }
function openCreate() { void navigate(`${productsPath.value}/new`); }
function editProduct(id: number) { void navigate(`${productsPath.value}/${id}`); }
function requestDeleteProduct(item: Product) { productToDelete.value = item; deleteDialogOpen.value = true; }
async function deleteProduct() { if (!productToDelete.value) return; deleting.value = true; try { await runTelefunc(() => onDeleteProduct({ id: productToDelete.value!.id }), { successMessage: "商品已删除。" }); deleteDialogOpen.value = false; productToDelete.value = null; await loadCatalog(); } finally { deleting.value = false; } }
async function setProductStatus(id: number, status: ProductStatus) { await runTelefunc(() => onSetProductStatus({ id, status }), { successMessage: "商品状态已更新。" }); await loadCatalog(); }
function deliveryLabel(v: Product["deliveryType"]) { return { CARD_AUTO: "自动卡密", FIXED_CARD: "固定内容", MANUAL: "人工发货", EXPRESS: "物流发货", SUPPLIER: "供应商履约" }[v]; } function statusLabel(v: ProductStatus) { return { DRAFT: "草稿", ACTIVE: "上架", INACTIVE: "下架" }[v]; }
</script>
