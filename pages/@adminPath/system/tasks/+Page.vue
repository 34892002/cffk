<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />
    <Card>
      <CardHeader>
        <CardTitle>暂无任务</CardTitle>
        <CardDescription>订单自动关闭、邮件重试和定时维护将在 Cron 任务接入后显示在这里。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          当前没有可执行或运行中的系统任务。
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
</script>
