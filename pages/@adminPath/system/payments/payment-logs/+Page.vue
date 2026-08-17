<template>
  <PaymentSettingsLayout>
    <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 class="text-xl font-semibold tracking-normal">支付日志</h2><p class="mt-1 text-sm text-muted-foreground">仅展示已脱敏的支付事件与验证结果。</p></div><Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadLogs"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button></div>
    <Card class="mt-4"><CardContent class="grid gap-4 pt-6"><AdminDataTable :columns="logColumns" :rows="logs" row-key="id" empty-text="暂无支付日志。"><template #toolbar><div class="flex flex-wrap items-center gap-2"><Select v-model="draftLogProvider"><SelectTrigger size="sm" class="w-40 shrink-0"><SelectValue placeholder="全部渠道" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部渠道</SelectItem><SelectItem v-for="item in providers" :key="item.provider" :value="item.provider">{{ item.title }}</SelectItem></SelectContent></Select><Button size="sm" :disabled="loading" @click="search">查询</Button><Button variant="outline" size="sm" :disabled="loading" @click="resetFilters">重置</Button></div></template><template #cell-orderNo="{ value }"><span class="font-mono text-xs">{{ value || "-" }}</span></template><template #cell-createdAt="{ value }"><span class="text-xs">{{ formatDate(value) }}</span></template><template #pagination><Pagination v-model:page="logPage" v-model:page-size="logPageSize" :total="logTotal" /></template></AdminDataTable></CardContent></Card>
  </PaymentSettingsLayout>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import PaymentSettingsLayout from "@/components/admin/PaymentSettingsLayout.vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runTelefunc } from "@/lib/telefunc-client";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { onGetPaymentLogs, onGetPaymentProviders } from "@/server/payment/admin.telefunc";
import type { PaymentProviderKind } from "@/server/payment/registry";

type PaymentLog = Awaited<ReturnType<typeof onGetPaymentLogs>>["rows"][number];
const timezone = useSiteTimezone();
type Provider = Awaited<ReturnType<typeof onGetPaymentProviders>>[number];
const logColumns: AdminTableColumn<PaymentLog>[] = [{ key: "createdAt", label: "时间" }, { key: "provider", label: "渠道" }, { key: "orderNo", label: "订单" }, { key: "eventType", label: "事件" }, { key: "verifyStatus", label: "验证" }, { key: "message", label: "结果" }];
const providers = ref<Provider[]>([]); const logs = ref<PaymentLog[]>([]); const draftLogProvider = ref<"ALL" | PaymentProviderKind>("ALL"); const logProvider = ref<"ALL" | PaymentProviderKind>("ALL"); const logPage = ref(1); const logPageSize = ref(10); const logTotal = ref(0); const loading = ref(false);
function formatDate(value: unknown) { return formatDateInTimezone(typeof value === "string" || typeof value === "number" || value instanceof Date ? value : 0, timezone.value); }
async function loadLogs() { loading.value = true; try { const [providerRows, result] = await Promise.all([runTelefunc(() => onGetPaymentProviders()), runTelefunc(() => onGetPaymentLogs({ provider: logProvider.value === "ALL" ? undefined : logProvider.value, page: logPage.value, pageSize: logPageSize.value }))]); providers.value = providerRows; logs.value = result.rows; logTotal.value = result.total; } catch { /* runTelefunc owns feedback */ } finally { loading.value = false; } }
function search() { logProvider.value = draftLogProvider.value; logPage.value = 1; void loadLogs(); }
function resetFilters() { draftLogProvider.value = "ALL"; search(); }
watch([logPage, logPageSize], ([page, pageSize], [previousPage, previousPageSize]) => { if (page !== previousPage || pageSize !== previousPageSize) void loadLogs(); });
onMounted(() => { void loadLogs(); });
</script>
