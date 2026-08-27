<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <div class="flex flex-wrap items-center justify-between gap-2"><div class="flex gap-2"><Input v-model="query" class="w-72" placeholder="搜索本地订单号" @keyup.enter="searchOrders" /><Select v-model="state" @update:model-value="searchOrders"><SelectTrigger class="w-44"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem v-for="value in states" :key="value" :value="value">{{ stateLabel(value) }}</SelectItem></SelectContent></Select><Button @click="searchOrders">查询</Button></div><Button variant="outline" @click="load">刷新</Button></div>
    <AdminDataTable :columns="columns" :rows="data.items" row-key="id" empty-text="暂无供应商采购订单。"><template #cell-provider="{ row }">{{ providerLabel(row.provider) }}</template><template #cell-state="{ row }"><Badge :variant="row.state === 'supplied' ? 'default' : row.state === 'failed' ? 'destructive' : 'secondary'">{{ stateLabel(row.state) }}</Badge></template><template #cell-lastErrorCode="{ row }">{{ row.lastErrorCode || "—" }}</template><template #actions="{ row }"><div class="flex justify-end gap-1"><Button v-if="row.upstreamOrderId" size="sm" variant="ghost" :disabled="busy === row.id" @click="reconcile(row)">对账</Button><Button v-if="!row.upstreamOrderId && !['supplied','refunded'].includes(row.state)" size="sm" variant="ghost" :disabled="busy === row.id" @click="reselect(row)">重选账号</Button><Button v-if="!['supplied','refunded'].includes(row.state)" size="sm" variant="ghost" :disabled="busy === row.id" @click="retry(row)">重试</Button></div></template><template #pagination><Pagination :total="data.total" :page="data.page" :page-size="data.pageSize" :page-size-options="[10, 20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template></AdminDataTable>
  </section>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runTelefunc } from "@/lib/telefunc-client";
import { onListSupplierOrders, onReconcileSupplierOrder, onReselectSupplierOrderAccount, onRetrySupplierOrder } from "@/server/supplier/orders.admin.telefunc";
type Data = Awaited<ReturnType<typeof onListSupplierOrders>>; type Item = Data["items"][number];
const states = ["pending", "selecting", "submitting", "processing", "uncertain", "supplied", "failed", "refunded"] as const;
const columns: AdminTableColumn<Item>[] = [{ key: "orderNo", label: "本地订单" }, { key: "provider", label: "上游" }, { key: "upstreamSkuName", label: "上游 SKU" }, { key: "quantity", label: "数量" }, { key: "totalCostMinor", label: "总成本" }, { key: "state", label: "状态" }, { key: "attemptCount", label: "尝试" }, { key: "lastErrorCode", label: "最近错误" }];
const data = reactive<Data>({ items: [], total: 0, page: 1, pageSize: 20 }); const query = ref(""); const state = ref("ALL"); const busy = ref<number | null>(null);
onMounted(load);
async function load() { Object.assign(data, await runTelefunc(() => onListSupplierOrders({ query: query.value, state: state.value === "ALL" ? undefined : state.value as typeof states[number], page: data.page, pageSize: data.pageSize }), { errorMessage: "读取供应商订单失败，请稍后重试。" })); }
function searchOrders() { data.page = 1; void load(); } function changePage(page: number) { data.page = page; void load(); } function changePageSize(size: number) { data.pageSize = size; data.page = 1; void load(); }
async function action(id: number, fn: () => Promise<unknown>) { busy.value = id; try { await runTelefunc(fn, { successMessage: "供应商订单已处理。" }); await load(); } finally { busy.value = null; } }
function retry(row: Item) { return action(row.id, () => onRetrySupplierOrder({ id: row.id })); } function reconcile(row: Item) { return action(row.id, () => onReconcileSupplierOrder({ id: row.id })); } function reselect(row: Item) { return action(row.id, () => onReselectSupplierOrderAccount({ id: row.id })); }
function providerLabel(value: Item["provider"]) { return value === "acg" ? "二次元 / ACG" : "独角数卡 Next"; } function stateLabel(value: string) { return { pending: "待采购", selecting: "选账号", submitting: "下单中", processing: "处理中", uncertain: "待对账", supplied: "已供货", failed: "失败", refunded: "已退款" }[value] ?? value; }
</script>
