<template>
  <section class="flex w-full flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-normal">优惠码</h1>
      <p class="mt-1 text-sm text-muted-foreground">创建优惠规则、限制使用次数和适用商品。金额以分保存。</p>
    </div>

    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <AdminDataTable :columns="columns" :rows="paginatedDiscounts" row-key="id">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="query" class="h-8 w-60" placeholder="搜索优惠码" />
          <Select v-model="statusFilter"><SelectTrigger class="h-8 min-w-28" aria-label="按状态筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="INACTIVE">停用</SelectItem></SelectContent></Select>
        </div>
        <div class="flex items-center gap-2"><Button variant="outline" size="icon-sm" :disabled="loading" aria-label="刷新数据" title="刷新数据" @click="loadDiscounts"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" /></Button><Button size="sm" @click="openCreate"><PlusIcon />添加优惠码</Button></div>
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

    <DialogRoot v-model:open="dialogOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-background p-0 shadow-lg">
          <div class="border-b px-6 py-5"><DialogTitle class="text-lg font-semibold">{{ form.id ? "编辑优惠码" : "新建优惠码" }}</DialogTitle><DialogDescription>空值或 `0` 表示不限制最低金额、使用次数和有效期。</DialogDescription></div>
          <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" @submit.prevent="saveDiscount">
            <div class="min-h-0 overflow-y-auto px-6 py-5"><div class="grid gap-4"><label class="grid gap-2 text-sm font-medium">优惠码<Input v-model="form.code" required maxlength="64" placeholder="SUMMER2026" /></label><label class="grid gap-2 text-sm font-medium">类型<Select v-model="form.type"><SelectTrigger class="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED">固定减免（分）</SelectItem><SelectItem value="PERCENT">百分比减免</SelectItem></SelectContent></Select></label><label class="grid gap-2 text-sm font-medium">{{ form.type === "FIXED" ? "优惠金额（分）" : "优惠百分比" }}<Input v-model.number="form.value" type="number" min="1" :max="form.type === 'PERCENT' ? 100 : undefined" required /></label><label class="grid gap-2 text-sm font-medium">最低订单金额（分）<Input v-model.number="form.minAmount" type="number" min="0" /></label><label class="grid gap-2 text-sm font-medium">最多使用次数<Input v-model.number="form.maxUses" type="number" min="0" /></label><label class="grid gap-2 text-sm font-medium">适用商品 ID<Input v-model="form.productIds" class="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="例如：1,2,3；留空为全部商品" /></label><label class="grid gap-2 text-sm font-medium">过期时间<Input v-model="form.expiresAt" type="datetime-local" class="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm" /></label><label class="flex items-center gap-2 text-sm font-medium"><Checkbox v-model="form.isActive" class="size-4" />启用此优惠码</label></div></div>
            <div class="flex justify-end gap-2 border-t bg-background px-6 py-4"><DialogClose as-child><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : form.id ? "保存优惠码" : "创建优惠码" }}</Button></div>
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { PlusIcon, RefreshCwIcon } from "@lucide/vue";
import { onGetDiscountCodes, onSaveDiscountCode, onSetDiscountCodeStatus } from "@/server/discount/admin.telefunc";

type Discount = Awaited<ReturnType<typeof onGetDiscountCodes>>[number];
type Form = { id?: number; code: string; type: "FIXED" | "PERCENT"; value: number; minAmount: number; maxUses: number; productIds: string; expiresAt: string; isActive: boolean };
const columns: AdminTableColumn<Discount>[] = [
  { key: "code", label: "优惠码" }, { key: "rule", label: "规则" }, { key: "minAmount", label: "最低金额" }, { key: "scope", label: "适用范围" }, { key: "usedCount", label: "已用次数" }, { key: "reservedCount", label: "预占次数" }, { key: "maxUses", label: "使用上限" }, { key: "expires", label: "有效期" },
];
const discounts = ref<Discount[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const dialogOpen = ref(false);
const query = ref("");
const statusFilter = ref<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
const currentPage = ref(1);
const pageSize = ref(10);
const form = reactive<Form>(emptyForm());
const filteredDiscounts = computed(() => {
  const value = query.value.trim().toLowerCase();
  return discounts.value.filter((item) => (!value || item.code.toLowerCase().includes(value)) && (statusFilter.value === "ALL" || item.isActive === (statusFilter.value === "ACTIVE")));
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredDiscounts.value.length / pageSize.value)));
const paginatedDiscounts = computed(() => filteredDiscounts.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value));
function emptyForm(): Form { return { code: "", type: "FIXED", value: 1, minAmount: 0, maxUses: 0, productIds: "", expiresAt: "", isActive: true }; }
function resetForm() { Object.assign(form, emptyForm()); }
function openCreate() { resetForm(); dialogOpen.value = true; }
watch([query, statusFilter, pageSize], () => { currentPage.value = 1; });
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages; });
async function loadDiscounts() { loading.value = true; error.value = null; try { discounts.value = await onGetDiscountCodes(); } catch (cause) { error.value = errorMessage(cause); } finally { loading.value = false; } }
async function saveDiscount() { saving.value = true; error.value = null; try { await onSaveDiscountCode({ id: form.id, code: form.code, type: form.type, value: form.value, minAmount: form.minAmount || null, maxUses: form.maxUses || null, productIds: form.productIds, expiresAt: form.expiresAt || null, isActive: form.isActive }); dialogOpen.value = false; resetForm(); await loadDiscounts(); } catch (cause) { error.value = errorMessage(cause); } finally { saving.value = false; } }
async function setStatus(id: number, isActive: boolean) { error.value = null; try { await onSetDiscountCodeStatus({ id, isActive }); await loadDiscounts(); } catch (cause) { error.value = errorMessage(cause); } }
function editDiscount(item: Discount) { Object.assign(form, { id: item.id, code: item.code, type: item.type, value: item.value, minAmount: item.minAmount ?? 0, maxUses: item.maxUses ?? 0, productIds: item.productIds ?? "", expiresAt: item.expiresAt ? toLocalDateTime(item.expiresAt) : "", isActive: item.isActive }); dialogOpen.value = true; }
function ruleLabel(item: Discount) { return item.type === "FIXED" ? `减免 ${formatAmount(item.value)}` : `减免 ${item.value}%`; }
function formatAmount(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value / 100); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function toLocalDateTime(value: Date | string | number) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function errorMessage(cause: unknown) { const code = cause instanceof Error ? cause.message : ""; return { ADMIN_ACCESS_REQUIRED: "管理员身份已失效，请重新登录。", DISCOUNT_CODE_INVALID: "优惠码只能包含 2 至 64 位大写字母、数字、下划线或连字符。", DISCOUNT_CODE_CONFLICT: "该优惠码已存在。", DISCOUNT_PERCENT_INVALID: "百分比优惠必须在 1 至 100 之间。", DISCOUNT_VALUE_INVALID: "优惠数值必须为正整数。", DISCOUNT_MIN_AMOUNT_INVALID: "最低订单金额必须为正整数。", DISCOUNT_MAX_USES_INVALID: "使用次数必须为正整数。", DISCOUNT_EXPIRES_AT_INVALID: "过期时间无效。", DISCOUNT_NOT_FOUND: "优惠码不存在。" }[code] ?? "操作失败，请检查输入后重试。"; }
onMounted(loadDiscounts);
</script>
