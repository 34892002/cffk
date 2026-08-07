<template>
  <section class="flex w-full flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">任务</h1>
      <p class="mt-1 text-muted-foreground">系统任务功能尚未启用，后台不会展示模拟任务数据。</p>
    </div>
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
</script>
