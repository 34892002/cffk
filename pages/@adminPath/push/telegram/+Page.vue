<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Card>
      <CardHeader>
        <CardTitle>渠道尚未接入</CardTitle>
        <CardDescription>当前版本暂未提供 Telegram Bot 配置和发送能力。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          接入 Bot Token、Chat ID 和通知模板后，这里将提供完整配置。
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
</script>
