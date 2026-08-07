<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Card>
      <CardHeader>
        <CardTitle>功能尚未接入</CardTitle>
        <CardDescription>当前版本暂未提供站点基础配置。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          接入站点名称、域名和公开信息配置后，这里将提供完整配置。
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
</script>
