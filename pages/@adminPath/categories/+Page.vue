<template>
  <section class="flex w-full flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-normal">分类管理</h1>
      <p class="mt-1 text-sm text-muted-foreground">管理商品分类、排序和启用状态。</p>
    </div>



    <Alert v-if="error" variant="destructive">
      <AlertTitle>操作未完成</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <AdminDataTable :columns="columns" :rows="paginatedCategories" row-key="id">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="query" class="h-8 w-60" placeholder="搜索分类名称或 Slug" />
          <Select v-model="statusFilter">
            <SelectTrigger class="h-8 min-w-28" aria-label="按状态筛选"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="DISABLED">停用</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" :disabled="loading" aria-label="刷新数据" title="刷新数据" @click="loadCategories">
            <RefreshCwIcon :class="loading ? 'animate-spin' : ''" />
          </Button>
          <Button size="sm" @click="openCreate"><PlusIcon />添加分类</Button>
        </div>
      </template>
      <template #cell-description="{ value }"><span class="block max-w-80 truncate text-muted-foreground">{{ value || "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'ACTIVE' ? 'secondary' : 'outline'">{{ row.status === "ACTIVE" ? "启用" : "停用" }}</Badge></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="openEdit(row)">编辑</Button><Button variant="ghost" size="sm" @click="setStatus(row)">{{ row.status === "ACTIVE" ? "停用" : "启用" }}</Button></template>
      <template #pagination>
        <Pagination
          :total="filteredCategories.length"
          :page="currentPage"
          :page-size="pageSize"
          @update:page="currentPage = $event"
          @update:page-size="pageSize = $event"
        />
      </template>
    </AdminDataTable>

    <DialogRoot v-model:open="dialogOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-lg border bg-background p-6 shadow-lg">
          <DialogTitle class="text-lg font-semibold">{{ form.id ? "编辑分类" : "添加分类" }}</DialogTitle>
          <DialogDescription>停用分类前，需要先下架该分类下的商品。</DialogDescription>
          <form class="grid gap-4" @submit.prevent="saveCategory">
            <div class="grid gap-2"><Label for="category-name">名称</Label><Input id="category-name" v-model="form.name" required /></div>
            <div class="grid gap-2"><Label for="category-slug">Slug</Label><Input id="category-slug" v-model="form.slug" required placeholder="software" /></div>
            <div class="grid gap-2"><Label for="category-description">描述</Label><Input id="category-description" v-model="form.description" /></div>
            <div class="grid gap-2"><Label for="category-sort">排序</Label><Input id="category-sort" v-model.number="form.sort" type="number" min="0" required /></div>
            <div class="flex justify-end gap-2 pt-2"><DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : form.id ? "保存分类" : "创建分类" }}</Button></div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PlusIcon, RefreshCwIcon } from "@lucide/vue";
import { onGetCatalogAdminData, onSaveCategory, onSetCategoryStatus } from "@/server/catalog/admin.telefunc";

type Catalog = Awaited<ReturnType<typeof onGetCatalogAdminData>>;
type Category = Catalog["categories"][number];
const columns: AdminTableColumn<Category>[] = [
  { key: "id", label: "ID", class: "w-20 font-mono text-xs text-muted-foreground", headerClass: "w-20" },
  { key: "name", label: "分类名称", class: "font-medium" },
  { key: "description", label: "描述" },
  { key: "slug", label: "Slug", class: "font-mono text-xs" },
  { key: "sort", label: "排序" },
  { key: "status", label: "状态" },
];
const categories = ref<Category[]>([]);
const query = ref("");
const statusFilter = ref<"ALL" | "ACTIVE" | "DISABLED">("ALL");
const currentPage = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const dialogOpen = ref(false);
const form = reactive({ id: undefined as number | undefined, name: "", slug: "", description: "", sort: 0 });
const filteredCategories = computed(() => {
  const value = query.value.trim().toLowerCase();
  return categories.value.filter((item) => {
    const matchesQuery = !value || item.name.toLowerCase().includes(value) || item.slug.toLowerCase().includes(value);
    const matchesStatus = statusFilter.value === "ALL" || item.status === statusFilter.value;
    return matchesQuery && matchesStatus;
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredCategories.value.length / pageSize.value)));
const paginatedCategories = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCategories.value.slice(start, start + pageSize.value);
});

onMounted(loadCategories);
watch(query, () => { currentPage.value = 1; });
watch(statusFilter, () => { currentPage.value = 1; });
watch(pageSize, () => { currentPage.value = 1; });
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages; });
async function loadCategories() { loading.value = true; error.value = null; try { categories.value = (await onGetCatalogAdminData()).categories; } catch (cause) { error.value = messageFor(cause); } finally { loading.value = false; } }
function openCreate() { resetForm(); dialogOpen.value = true; }
function openEdit(item: Category) { Object.assign(form, { id: item.id, name: item.name, slug: item.slug, description: item.description ?? "", sort: item.sort }); error.value = null; dialogOpen.value = true; }
async function saveCategory() { saving.value = true; error.value = null; try { await onSaveCategory({ ...form }); dialogOpen.value = false; resetForm(); await loadCategories(); } catch (cause) { error.value = messageFor(cause); } finally { saving.value = false; } }
async function setStatus(item: Category) { error.value = null; try { await onSetCategoryStatus({ id: item.id, status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }); await loadCategories(); } catch (cause) { error.value = messageFor(cause); } }
function resetForm() { Object.assign(form, { id: undefined, name: "", slug: "", description: "", sort: 0 }); }
function messageFor(cause: unknown) { const value = cause instanceof Error ? cause.message : String(cause); return ({ CATEGORY_NAME_REQUIRED: "分类名称不能为空。", CATEGORY_SLUG_CONFLICT: "分类 Slug 已存在。", CATEGORY_HAS_ACTIVE_PRODUCTS: "请先下架该分类下的全部商品，再停用分类。", SLUG_REQUIRED: "Slug 只能包含英文、数字和连字符。" } as Record<string, string>)[value] ?? "请求未能完成，请检查输入后重试。"; }
</script>
