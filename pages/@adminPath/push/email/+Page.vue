<template>
  <MailSettingsLayout>
    <section aria-labelledby="email-status-title" class="mb-8 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
      <Card>
        <CardHeader><div class="flex items-start justify-between gap-3"><div><CardTitle id="email-status-title">邮件发送中心</CardTitle><CardDescription>从这里查看投递状态、配置发送通道和维护业务模板。</CardDescription></div><Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadOverview"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button></div></CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-3">
          <a v-for="item in quickLinks" :key="item.href" :href="item.href" class="group rounded-lg border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/50">
            <div class="flex items-center justify-between gap-3"><span class="font-medium">{{ item.title }}</span><span class="text-muted-foreground transition-transform group-hover:translate-x-0.5">→</span></div>
            <p class="mt-2 text-sm text-muted-foreground">{{ item.description }}</p>
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>当前状态</CardTitle><CardDescription>统一推送日志中的邮件数据。</CardDescription></CardHeader>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between border-b pb-3"><span class="text-sm text-muted-foreground">累计投递</span><span class="text-2xl font-semibold tabular-nums">{{ overview.total }}</span></div>
          <div class="flex items-center justify-between border-b pb-3"><span class="text-sm text-muted-foreground">成功率</span><span class="font-semibold tabular-nums">{{ successRate }}%</span></div>
          <div class="flex items-center justify-between"><span class="text-sm text-muted-foreground">待处理</span><Badge :variant="overview.pending ? 'outline' : 'secondary'">{{ overview.pending }}</Badge></div>
        </CardContent>
      </Card>
    </section>

    <Alert v-if="error" variant="destructive">
      <AlertTitle>无法加载邮件统计</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <section aria-labelledby="email-overview-title">
      <div class="mb-3 flex items-end justify-between gap-3"><div><h2 id="email-overview-title" class="text-lg font-semibold">投递概览</h2><p class="mt-1 text-sm text-muted-foreground">快速了解成功、失败和测试邮件数量。</p></div><a :href="historyPath" class="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">查看完整日志 →</a></div>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card v-for="metric in metrics" :key="metric.label"><CardHeader class="pb-2"><CardDescription>{{ metric.label }}</CardDescription><CardTitle class="text-3xl font-semibold tabular-nums">{{ metric.value }}</CardTitle></CardHeader></Card>
      </div>
    </section>
  </MailSettingsLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import { usePageContext } from "vike-vue/usePageContext";
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetEmailOverview } from "@/server/email/admin.telefunc";

const pageContext = usePageContext();
const basePath = computed(() => `/${pageContext.routeParams.adminPath}`);
const historyPath = computed(() => `${basePath.value}/push/history`);
const quickLinks = computed(() => [
  { title: "通道配置", description: "配置 API、SMTP 或 Cloudflare Email Sending 邮件服务。", href: `${basePath.value}/push/email/post-office` },
  { title: "邮件模板", description: "维护支付、发货和测试邮件内容。", href: `${basePath.value}/push/email/templates` },
  { title: "发送日志", description: "按订单号、状态和场景排查投递结果。", href: historyPath.value },
]);
const overview = reactive({ total: 0, success: 0, failed: 0, skipped: 0, pending: 0, test: 0 });
const loading = ref(false);
const error = ref<string | null>(null);
const successRate = computed(() => overview.total ? Math.round((overview.success / overview.total) * 100) : 0);
const metrics = computed(() => [
  { label: "投递总数", value: overview.total },
  { label: "发送成功", value: overview.success },
  { label: "发送失败", value: overview.failed },
  { label: "测试邮件", value: overview.test },
]);
async function loadOverview() {
  loading.value = true;
  error.value = null;
  try { Object.assign(overview, await runTelefunc(() => onGetEmailOverview(), { notifyError: false })); }
  catch (cause) { error.value = userErrorMessage(cause); }
  finally { loading.value = false; }
}
onMounted(loadOverview);
</script>
