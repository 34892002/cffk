<template>
  <section class="flex w-full flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">邮件统计</h1>
        <p class="mt-1 text-sm text-muted-foreground">基于全部邮件发送日志的实时汇总。</p>
      </div>
      <Button :disabled="loading" @click="loadOverview">刷新数据</Button>
    </div>

    <Alert v-if="error" variant="destructive">
      <AlertTitle>无法读取统计</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card v-for="metric in metrics" :key="metric.label">
        <CardHeader class="pb-2">
          <CardDescription>{{ metric.label }}</CardDescription>
          <CardTitle class="text-3xl font-semibold tabular-nums">{{ metric.value }}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { onGetEmailOverview } from "@/server/email/admin.telefunc";

const overview = reactive({ total: 0, success: 0, failed: 0, test: 0 });
const loading = ref(false);
const error = ref<string | null>(null);
const metrics = computed(() => [
  { label: "发送总数", value: overview.total },
  { label: "成功次数", value: overview.success },
  { label: "失败次数", value: overview.failed },
  { label: "测试邮件", value: overview.test },
]);

async function loadOverview() {
  loading.value = true;
  error.value = null;
  try {
    Object.assign(overview, await onGetEmailOverview());
  } catch (cause) {
    error.value = cause instanceof Error && cause.message === "ADMIN_ACCESS_REQUIRED"
      ? "管理员身份已失效，请重新登录。"
      : "读取邮件统计失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

onMounted(loadOverview);
</script>
