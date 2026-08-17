<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <AdminDataTable :columns="columns" :rows="paginatedDiscounts" row-key="id">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="draftQuery" class="h-8 w-60" placeholder="搜索优惠券" @keyup.enter="search" />
          <Select v-model="draftStatusFilter"><SelectTrigger size="sm" class="w-28 shrink-0" aria-label="按状态筛选"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="INACTIVE">停用</SelectItem></SelectContent></Select>
          <Button size="sm" @click="search">查询</Button>
          <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
        </div>
        <div class="flex items-center gap-2"><Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadDiscounts"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button><Button size="sm" @click="openCreate"><PlusIcon />添加优惠券</Button></div>
      </template>
      <template #cell-code="{ row }"><span class="font-mono font-medium">{{ row.code }}</span></template>
      <template #cell-rule="{ row }"><span>{{ ruleLabel(row) }}</span></template>
      <template #cell-scope="{ row }"><span class="font-mono text-xs">{{ row.productIds || "全部商品" }}</span></template>
      <template #cell-usedCount="{ value }"><span>{{ value }}</span></template>
      <template #cell-reservedCount="{ value }"><span>{{ value || 0 }}</span></template>
      <template #cell-maxUses="{ value }"><span>{{ value || "不限" }}</span></template>
      <template #cell-minAmount="{ row }"><span>{{ row.minAmount ? formatAmount(row.minAmount) : "不限" }}</span></template>
      <template #cell-expires="{ row }"><span class="whitespace-nowrap text-xs">{{ row.expiresAt ? formatDate(row.expiresAt) : "长期有效" }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.isActive ? 'secondary' : 'outline'">{{ row.isActive ? "启用" : "停用" }}</Badge></template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="editDiscount(row)">编辑</Button><Button variant="ghost" size="sm" @click="setStatus(row.id, !row.isActive)">{{ row.isActive ? "停用" : "启用" }}</Button></template>
      <template #pagination><Pagination :total="filteredDiscounts.length" :page="currentPage" :page-size="pageSize" @update:page="currentPage = $event" @update:page-size="pageSize = $event" /></template>
    </AdminDataTable>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader class="border-b px-6 py-5 pr-8">
          <DialogTitle class="text-lg font-semibold">{{ form.id ? "编辑优惠券" : "新建优惠券" }}</DialogTitle>
          <DialogDescription>空值或 `0` 表示不限制最低金额、使用次数和有效期。</DialogDescription>
        </DialogHeader>
        <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" @submit.prevent="saveDiscount">
          <div class="min-h-0 overflow-y-auto px-6 py-5"><div class="grid gap-4"><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span class="flex items-center gap-1"><span class="text-destructive">*</span> 优惠券</span><Input v-model="form.code" required maxlength="64" placeholder="SUMMER2026" /></label><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span>类型</span><Select v-model="form.type"><SelectTrigger class="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED">固定减免（元）</SelectItem><SelectItem value="PERCENT">百分比减免</SelectItem></SelectContent></Select></label><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span class="flex items-center gap-1"><span class="text-destructive">*</span> {{ form.type === "FIXED" ? "优惠金额（元）" : "优惠百分比" }}</span><Input v-model="form.value" inputmode="decimal" :min="form.type === 'PERCENT' ? 1 : '0.01'" :max="form.type === 'PERCENT' ? 100 : undefined" required /></label><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span>最低订单金额（元）</span><Input v-model="form.minAmount" inputmode="decimal" placeholder="0 表示不限" /></label><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span>最多使用次数</span><Input v-model.number="form.maxUses" type="number" min="0" /></label><div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span>适用商品</span><Combobox v-model="selectedProducts" multiple by="id"><ComboboxAnchor as-child><ComboboxTrigger as-child><Button type="button" variant="outline" class="h-9 w-full justify-between font-normal"><span class="truncate">{{ selectedProducts.length ? selectedProducts.map((product) => product.name).join("、") : "全部商品" }}</span><ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" /></Button></ComboboxTrigger></ComboboxAnchor><ComboboxList class="w-[min(var(--reka-combobox-trigger-width),calc(100vw-2rem))]" align="start"><ComboboxInput placeholder="搜索商品名称或 Slug" /><ComboboxEmpty>没有匹配的商品。</ComboboxEmpty><ComboboxGroup><ComboboxItem v-for="product in products" :key="product.id" :value="product"><span class="border-input data-[selected=true]:border-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground pointer-events-none size-4 shrink-0 rounded-sm border transition-all *:[svg]:opacity-0 data-[selected=true]:*:[svg]:opacity-100" :data-selected="selectedProducts.some((item) => item.id === product.id)"><CheckIcon class="size-3.5 text-current" /></span><span class="min-w-0"><span class="block truncate">{{ product.name }}</span><span class="block truncate text-xs text-muted-foreground">#{{ product.id }} · {{ product.slug }}</span></span></ComboboxItem></ComboboxGroup></ComboboxList></Combobox></div><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span>过期时间</span><DatePicker v-model="form.expiresAt" placeholder="选择过期日期" aria-label="选择优惠券过期日期" /></label><label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 text-sm font-medium"><span>启用此优惠券</span><Switch v-model="form.isActive" /></label></div></div>
          <DialogFooter class="border-t bg-background px-6 py-4"><DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : form.id ? "保存优惠券" : "创建优惠券" }}</Button></DialogFooter>
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
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxAnchor, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, RefreshCwIcon } from "@lucide/vue";
import { formatDateInTimezone, formatDateTimeInputInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetDiscountCodes, onGetDiscountProductOptions, onSaveDiscountCode, onSetDiscountCodeStatus } from "@/server/discount/admin.telefunc";

type Discount = Awaited<ReturnType<typeof onGetDiscountCodes>>[number];
type ProductOption = Awaited<ReturnType<typeof onGetDiscountProductOptions>>[number];
type Form = { id?: number; code: string; type: "FIXED" | "PERCENT"; value: string; minAmount: string; maxUses: number; productIds: string; expiresAt: string; isActive: boolean }; 
const columns: AdminTableColumn<Discount>[] = [
  { key: "code", label: "优惠券" }, { key: "rule", label: "规则" }, { key: "minAmount", label: "最低金额" }, { key: "scope", label: "适用范围" }, { key: "usedCount", label: "已用次数" }, { key: "reservedCount", label: "预占次数" }, { key: "maxUses", label: "使用上限" }, { key: "expires", label: "有效期" },
];
const discounts = ref<Discount[]>([]);
const products = ref<ProductOption[]>([]);
const selectedProducts = ref<ProductOption[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const dialogOpen = ref(false);
const draftQuery = ref("");
const draftStatusFilter = ref<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
const query = ref("");
const statusFilter = ref<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
const currentPage = ref(1);
const pageSize = ref(10);
const form = reactive<Form>(emptyForm());
const filteredDiscounts = computed(() => {
  const value = query.value.trim().toLowerCase();
  return discounts.value.filter((item) => (!value || item.code.toLowerCase().includes(value)) && (statusFilter.value === "ALL" || item.isActive === (statusFilter.value === "ACTIVE")));
});
const timezone = useSiteTimezone();
const totalPages = computed(() => Math.max(1, Math.ceil(filteredDiscounts.value.length / pageSize.value)));
const paginatedDiscounts = computed(() => filteredDiscounts.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value));
function emptyForm(): Form { return { code: "", type: "FIXED", value: "1.00", minAmount: "", maxUses: 0, productIds: "", expiresAt: "", isActive: true }; }
function resetForm() { Object.assign(form, emptyForm()); selectedProducts.value = []; }
function openCreate() { resetForm(); dialogOpen.value = true; }
function search() { query.value = draftQuery.value; statusFilter.value = draftStatusFilter.value; currentPage.value = 1; }
function resetFilters() { draftQuery.value = ""; draftStatusFilter.value = "ALL"; search(); }
watch(pageSize, () => { currentPage.value = 1; });
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages; });
async function loadDiscounts() { loading.value = true; error.value = null; try { const [discountResult, productResult] = await Promise.all([runTelefunc(() => onGetDiscountCodes(), { notifyError: false }), runTelefunc(() => onGetDiscountProductOptions(), { notifyError: false })]); discounts.value = discountResult; products.value = productResult; } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; } }
async function saveDiscount() { saving.value = true; error.value = null; try { await runTelefunc(() => onSaveDiscountCode({ id: form.id, code: form.code, type: form.type, value: form.value, minAmount: form.minAmount || null, maxUses: form.maxUses || null, productIds: selectedProducts.value.map((product) => product.id).join(","), expiresAt: form.expiresAt ? `${form.expiresAt}T23:59` : null, isActive: form.isActive }), { notifyError: false }); dialogOpen.value = false; resetForm(); await loadDiscounts(); } catch (cause) { error.value = userErrorMessage(cause); } finally { saving.value = false; } }
async function setStatus(id: number, isActive: boolean) { error.value = null; try { await runTelefunc(() => onSetDiscountCodeStatus({ id, isActive }), { notifyError: false }); await loadDiscounts(); } catch (cause) { error.value = userErrorMessage(cause); } }
function editDiscount(item: Discount) { Object.assign(form, { id: item.id, code: item.code, type: item.type, value: item.value, minAmount: item.minAmount ?? "", maxUses: item.maxUses ?? 0, productIds: item.productIds ?? "", expiresAt: item.expiresAt ? toLocalDateTime(item.expiresAt).slice(0, 10) : "", isActive: item.isActive }); const selectedIds = new Set((item.productIds ?? "").split(",").map(Number)); selectedProducts.value = products.value.filter((product) => selectedIds.has(product.id)); dialogOpen.value = true; }
function ruleLabel(item: Discount) { return item.type === "FIXED" ? `减免 ${formatAmount(item.value)}` : `减免 ${item.value}%`; }
function formatAmount(value: string) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(Number(value)); }
function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value); }
function toLocalDateTime(value: Date | string | number) { return formatDateTimeInputInTimezone(value, timezone.value); }

onMounted(loadDiscounts);
</script>
