<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Alert v-if="loadError" variant="destructive">
      <AlertTitle>读取分类失败</AlertTitle>
      <AlertDescription>{{ loadError }}</AlertDescription>
    </Alert>

    <AdminDataTable :columns="columns" :rows="paginatedCategories" row-key="id">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="draftQuery" class="h-8 w-60" placeholder="搜索分类名称或 Slug" @keyup.enter="search" />
          <Select v-model="draftStatusFilter">
            <SelectTrigger size="sm" class="w-28 shrink-0" aria-label="按状态筛选"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="DISABLED">停用</SelectItem></SelectContent>
          </Select>
          <Button size="sm" @click="search">查询</Button>
          <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadCategories">
            <RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新
          </Button>
          <Button size="sm" @click="openCreate"><PlusIcon />添加分类</Button>
        </div>
      </template>
      <template #cell-description="{ value }"><span class="block max-w-80 truncate text-muted-foreground">{{ value || "-" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.status === 'ACTIVE' ? 'default' : 'secondary'">{{ row.status === "ACTIVE" ? "启用" : "停用" }}</Badge></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" :disabled="isDefaultCategory(row)" :title="isDefaultCategory(row) ? '默认分类不可编辑' : undefined" @click="openEdit(row)">编辑</Button><Button variant="ghost" size="sm" :disabled="isDefaultCategory(row)" :title="isDefaultCategory(row) ? '默认分类不可停用' : undefined" @click="setStatus(row)">{{ row.status === "ACTIVE" ? "停用" : "启用" }}</Button></template>
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

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader class="pr-8">
          <DialogTitle>{{ form.id ? "编辑分类" : "添加分类" }}</DialogTitle>
          <DialogDescription>停用分类前，需要先下架该分类下的商品。</DialogDescription>
        </DialogHeader>
        <form class="grid gap-4" @submit.prevent="saveCategory">
          <div class="grid gap-2"><Label for="category-name"><span class="text-destructive">*</span> 名称</Label><Input id="category-name" v-model="form.name" required /></div>
          <div class="grid gap-2"><Label for="category-slug"><span class="text-destructive">*</span> Slug</Label><Input id="category-slug" v-model="form.slug" required placeholder="输入名称后自动生成，可手动修改" @update:model-value="onSlug" /></div>
          <div class="grid gap-2"><Label for="category-description">描述</Label><Input id="category-description" v-model="form.description" /></div>
          <div class="grid gap-2"><Label for="category-sort"><span class="text-destructive">*</span> 排序</Label><Input id="category-sort" v-model.number="form.sort" type="number" min="0" required /></div>
          <DialogFooter>
            <DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose>
            <Button type="submit" :disabled="saving">{{ saving ? "保存中..." : form.id ? "保存分类" : "创建分类" }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PlusIcon, RefreshCwIcon } from "@lucide/vue";
import { slugify } from "@/lib/slugify";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
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
const draftQuery = ref("");
const draftStatusFilter = ref<"ALL" | "ACTIVE" | "DISABLED">("ALL");
const query = ref("");
const statusFilter = ref<"ALL" | "ACTIVE" | "DISABLED">("ALL");
const currentPage = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
const dialogOpen = ref(false);
const form = reactive({ id: undefined as number | undefined, name: "", slug: "", description: "", sort: 0 });
const slugTouched = ref(false);
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
function search() { query.value = draftQuery.value; statusFilter.value = draftStatusFilter.value; currentPage.value = 1; }
function resetFilters() { draftQuery.value = ""; draftStatusFilter.value = "ALL"; search(); }
watch(pageSize, () => { currentPage.value = 1; });
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages; });
async function loadCategories() { loading.value = true; loadError.value = null; try { categories.value = (await runTelefunc(() => onGetCatalogAdminData(), { notifyError: false })).categories; } catch (cause) { loadError.value = userErrorMessage(cause); } finally { loading.value = false; } }
function isDefaultCategory(item: Category) { return item.slug === "default"; }
function openCreate() { resetForm(); dialogOpen.value = true; }
function openEdit(item: Category) {
  slugTouched.value = false;
  Object.assign(form, { id: item.id, name: item.name, slug: item.slug, description: item.description ?? "", sort: item.sort });
  dialogOpen.value = true;
}
async function saveCategory() { saving.value = true; try { await runTelefunc(() => onSaveCategory({ ...form })); dialogOpen.value = false; resetForm(); await loadCategories(); } catch { /* runTelefunc 已显示统一错误提示。 */ } finally { saving.value = false; } }
async function setStatus(item: Category) { try { await runTelefunc(() => onSetCategoryStatus({ id: item.id, status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })); await loadCategories(); } catch { /* runTelefunc 已显示统一错误提示。 */ } }
function resetForm() {
  slugTouched.value = false;
  Object.assign(form, { id: undefined, name: "", slug: "", description: "", sort: 0 });
}
watch(() => form.name, (name) => {
  if (!slugTouched.value && !form.id) form.slug = slugify(name);
});
function onSlug() { slugTouched.value = true; }

</script>
