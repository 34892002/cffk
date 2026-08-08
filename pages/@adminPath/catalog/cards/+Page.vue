<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { PlusIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runTelefunc } from "@/lib/telefunc-client";
import {
  onCreateCard,
  onDeleteCard,
  onDeleteUnusedCards,
  onGetCardAdminData,
  onImportCards,
} from "@/server/inventory/admin.telefunc";

type CardData = Awaited<ReturnType<typeof onGetCardAdminData>>;
type CardRow = CardData["items"][number];
type CardStatus = "UNUSED" | "LOCKED" | "SOLD" | "DISABLED";

const columns: AdminTableColumn<CardRow>[] = [
  { key: "id", label: "ID", class: "font-mono text-xs", headerClass: "w-20" },
  { key: "productName", label: "商品", class: "min-w-40" },
  { key: "contentPreview", label: "卡密预览", class: "font-mono text-xs" },
  { key: "batchNo", label: "批次", class: "font-mono text-xs" },
  { key: "status", label: "状态" },
  { key: "orderId", label: "订单", class: "font-mono text-xs" },
  { key: "createdAt", label: "创建时间", class: "whitespace-nowrap text-xs" },
];

const data = reactive<CardData>({
  items: [], total: 0, page: 1, pageSize: 20, products: [], overview: { total: 0, available: 0, sold: 0 },
});
const filters = reactive({
  productId: undefined as number | undefined,
  status: undefined as CardStatus | undefined,
  batchNo: "",
  startDate: "",
  endDate: "",
});
const singleForm = reactive({ productId: undefined as number | undefined, batchNo: "", content: "" });
const importForm = reactive({ productId: undefined as number | undefined, batchNo: "", content: "" });
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const saving = ref(false);

const addDialogOpen = ref(false);
const importDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const clearDialogOpen = ref(false);
const cardToDelete = ref<CardRow | null>(null);

const total = computed(() => data.total);
const selectedProductName = computed(() => data.products.find((item) => item.id === filters.productId)?.name ?? "");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Shanghai",
});

onMounted(loadCards);

async function loadCards() {
  loading.value = true;
  
  try {
    const result = await runTelefunc(() => onGetCardAdminData({
      ...filters,
      batchNo: filters.batchNo || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      page: page.value,
      pageSize: pageSize.value,
    }));
    Object.assign(data, result);
  } catch {
    // runTelefunc has already displayed the normalized error toast.
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void loadCards();
}

function resetFilters() {
  filters.productId = undefined;
  filters.status = undefined;
  filters.batchNo = "";
  filters.startDate = "";
  filters.endDate = "";
  search();
}

function changePageTo(value: number) {
  page.value = value;
  void loadCards();
}

function changePageSize(value: number) {
  pageSize.value = value;
  page.value = 1;
  void loadCards();
}

async function createCard() {
  saving.value = true;
  
  try {
    await runTelefunc(() => onCreateCard({ ...singleForm, productId: singleForm.productId! }), { successMessage: "卡密已新增。" });
    singleForm.batchNo = "";
    singleForm.content = "";
    addDialogOpen.value = false;

    await loadCards();
  } catch {
    // runTelefunc has already displayed the normalized error toast.
  } finally {
    saving.value = false;
  }
}

async function importCards() {
  saving.value = true;
  
  try {
    await runTelefunc(() => onImportCards({ ...importForm, productId: importForm.productId! }), { successMessage: "卡密已导入。" });
    importForm.batchNo = "";
    importForm.content = "";
    importDialogOpen.value = false;

    await loadCards();
  } catch {
    // runTelefunc has already displayed the normalized error toast.
  } finally {
    saving.value = false;
  }
}

function requestDelete(card: CardRow) {
  cardToDelete.value = card;
  deleteDialogOpen.value = true;
}

async function deleteCard() {
  if (!cardToDelete.value) return;
  saving.value = true;
  
  try {
    await runTelefunc(() => onDeleteCard({ id: cardToDelete.value!.id }), { successMessage: "卡密已删除。" });
    deleteDialogOpen.value = false;
    cardToDelete.value = null;

    await loadCards();
  } catch {
    // runTelefunc has already displayed the normalized error toast.
  } finally {
    saving.value = false;
  }
}

function requestClearUnused() {
  if (!filters.productId) {
    toast.error("请先在筛选条件中选择要清空库存的自动发货商品。");
    return;
  }
  clearDialogOpen.value = true;
}

async function clearUnusedCards() {
  if (!filters.productId) return;
  saving.value = true;
  
  try {
    await runTelefunc(() => onDeleteUnusedCards({ productId: filters.productId! }), { successMessage: "未售库存已清空。" });
    clearDialogOpen.value = false;

    await loadCards();
  } catch {
    // runTelefunc has already displayed the normalized error toast.
  } finally {
    saving.value = false;
  }
}

function statusLabel(status: CardStatus) {
  return { UNUSED: "未售出", LOCKED: "已预占", SOLD: "已售出", DISABLED: "已禁用" }[status];
}

function statusVariant(status: CardStatus) {
  if (status === "UNUSED") return "secondary";
  if (status === "DISABLED") return "destructive";
  return "outline";
}

function formatDate(value: Date) {
  return dateFormatter.format(value);
}


</script>

<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />


    <div class="grid gap-4 md:grid-cols-3">
      <Card class="gap-0"><CardHeader class="pb-0"><CardDescription>总卡密</CardDescription><CardTitle class="text-3xl">{{ data.overview.total }}</CardTitle></CardHeader><CardContent class="pt-1.5 text-sm text-muted-foreground">全部库存记录</CardContent></Card>
      <Card class="gap-0"><CardHeader class="pb-0"><CardDescription>可用库存</CardDescription><CardTitle class="text-3xl">{{ data.overview.available }}</CardTitle></CardHeader><CardContent class="pt-1.5 text-sm text-muted-foreground">未售出的卡密</CardContent></Card>
      <Card class="gap-0"><CardHeader class="pb-0"><CardDescription>已售出</CardDescription><CardTitle class="text-3xl">{{ data.overview.sold }}</CardTitle></CardHeader><CardContent class="pt-1.5 text-sm text-muted-foreground">已成功发货的卡密</CardContent></Card>
    </div>

    <Card>
      <CardHeader class="gap-4 border-b">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div><CardTitle>库存列表</CardTitle><CardDescription class="mt-1">按商品、状态、批次及创建时间查找卡密。</CardDescription></div>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" :disabled="loading" @click="loadCards"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
            <Button variant="destructive" size="sm" @click="requestClearUnused"><Trash2Icon />清空未售库存</Button>
            <Button variant="outline" size="sm" @click="addDialogOpen = true"><PlusIcon />新增卡密</Button>
            <Button size="sm" @click="importDialogOpen = true"><UploadIcon />批量导入</Button>
          </div>
        </div>
        <div class="flex w-full flex-wrap items-center gap-3 lg:w-[70%]">
          <Select class="min-w-52 flex-[1.4_1_13rem]" :model-value="filters.productId === undefined ? 'all' : String(filters.productId)" @update:model-value="filters.productId = $event === 'all' ? undefined : Number($event)">
            <SelectTrigger><SelectValue placeholder="选择商品" /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部商品</SelectItem><SelectItem v-for="item in data.products" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent>
          </Select>
          <Select class="min-w-32 flex-[0.75_1_8rem]" :model-value="filters.status ?? 'all'" @update:model-value="filters.status = $event === 'all' ? undefined : $event as CardStatus">
            <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="UNUSED">未售出</SelectItem><SelectItem value="LOCKED">已预占</SelectItem><SelectItem value="SOLD">已售出</SelectItem><SelectItem value="DISABLED">已禁用</SelectItem></SelectContent>
          </Select>
          <Input v-model="filters.batchNo" class="min-w-40 flex-[1_1_10rem]" placeholder="批次号" @keyup.enter="search" />
          <div class="w-36 shrink-0"><DatePicker v-model="filters.startDate" placeholder="开始日期" aria-label="选择开始日期" /></div>
          <div class="w-36 shrink-0"><DatePicker v-model="filters.endDate" placeholder="结束日期" aria-label="选择结束日期" /></div>
          <div class="flex gap-2"><Button size="sm" @click="search">搜索</Button><Button variant="outline" size="sm" @click="resetFilters">重置</Button></div>
        </div>
      </CardHeader>
      <CardContent class="pt-6">
        <AdminDataTable :columns="columns" :rows="data.items" row-key="id" empty-text="暂无符合条件的卡密。">
          <template #cell-productName="{ value }"><span class="font-medium">{{ value }}</span></template>
          <template #cell-contentPreview="{ value }"><span class="font-mono text-xs">{{ value }}</span></template>
          <template #cell-batchNo="{ value }">{{ value || "-" }}</template>
          <template #cell-status="{ row }"><Badge :variant="statusVariant(row.status as CardStatus)">{{ statusLabel(row.status as CardStatus) }}</Badge></template>
          <template #cell-orderId="{ value }">{{ value ? `#${value}` : "-" }}</template>
          <template #cell-createdAt="{ value }">{{ formatDate(value as Date) }}</template>
          <template #actions="{ row }"><Button v-if="row.status === 'UNUSED'" variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="requestDelete(row)"><Trash2Icon />删除</Button></template>
          <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[20, 50, 100]" @update:page="changePageTo" @update:page-size="changePageSize" /></template>
        </AdminDataTable>
      </CardContent>
    </Card>

    <Dialog v-model:open="addDialogOpen">
      <DialogContent class="grid max-h-[calc(100vh-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader class="border-b px-6 py-5 pr-8"><DialogTitle>新增卡密</DialogTitle><DialogDescription>为自动发货商品添加一条未售出的卡密。</DialogDescription></DialogHeader>
        <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" @submit.prevent="createCard">
          <div class="min-h-0 overflow-y-auto px-6 py-5">
            <div class="grid gap-4">
              <label class="grid gap-2 text-sm font-medium">商品<Select :model-value="singleForm.productId === undefined ? undefined : String(singleForm.productId)" @update:model-value="singleForm.productId = Number($event)"><SelectTrigger><SelectValue placeholder="选择自动卡密商品" /></SelectTrigger><SelectContent><SelectItem v-for="item in data.products" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent></Select></label>
              <label class="grid gap-2 text-sm font-medium">批次号（可选）<Input v-model="singleForm.batchNo" placeholder="例如：20260806" /></label>
              <label class="grid gap-2 text-sm font-medium">卡密内容<Textarea v-model="singleForm.content" required class="min-h-28" placeholder="输入一条卡密" /></label>
            </div>
          </div>
          <DialogFooter class="border-t bg-background px-6 py-4"><DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" :disabled="saving || !singleForm.productId">新增卡密</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="importDialogOpen">
      <DialogContent class="grid max-h-[calc(100vh-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader class="border-b px-6 py-5 pr-8"><DialogTitle>批量导入卡密</DialogTitle><DialogDescription>每行一条卡密；重复行会自动去重，单次最多 1,000 条。</DialogDescription></DialogHeader>
        <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" @submit.prevent="importCards">
          <div class="min-h-0 overflow-y-auto px-6 py-5">
            <div class="grid gap-4">
              <label class="grid gap-2 text-sm font-medium">商品<Select :model-value="importForm.productId === undefined ? undefined : String(importForm.productId)" @update:model-value="importForm.productId = Number($event)"><SelectTrigger><SelectValue placeholder="选择自动卡密商品" /></SelectTrigger><SelectContent><SelectItem v-for="item in data.products" :key="item.id" :value="String(item.id)">{{ item.name }}</SelectItem></SelectContent></Select></label>
              <label class="grid gap-2 text-sm font-medium">批次号（可选）<Input v-model="importForm.batchNo" placeholder="例如：20260806" /></label>
              <label class="grid gap-2 text-sm font-medium">卡密内容<Textarea v-model="importForm.content" required class="min-h-48" placeholder="每行输入一条卡密" /></label>
            </div>
          </div>
          <DialogFooter class="border-t bg-background px-6 py-4"><DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" :disabled="saving || !importForm.productId">批量导入</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader class="pr-8"><DialogTitle>删除未售出卡密？</DialogTitle><DialogDescription>此操作不可恢复。卡密 #{{ cardToDelete?.id }} 将被永久删除。</DialogDescription></DialogHeader>
        <DialogFooter><DialogClose as-child><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" :disabled="saving" @click="deleteCard">确认删除</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="clearDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader class="pr-8"><DialogTitle>清空未售库存？</DialogTitle><DialogDescription>将永久删除“{{ selectedProductName }}”的所有未售出卡密。此操作不可恢复。</DialogDescription></DialogHeader>
        <DialogFooter><DialogClose as-child><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" :disabled="saving" @click="clearUnusedCards">确认清空</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
