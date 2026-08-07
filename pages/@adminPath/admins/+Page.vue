<template>
  <section class="flex w-full flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">管理员</h1>
        <p class="mt-1 text-sm text-muted-foreground">查看管理员账号并控制后台访问状态。</p>
      </div>
      <Button :disabled="loading" @click="loadAdmins">刷新数据</Button>
    </div>

    <Alert v-if="error" variant="destructive">
      <AlertTitle>操作未完成</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <CardTitle>管理员账号</CardTitle>
        <CardDescription>不能停用自己；系统至少保留一名活动管理员。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>邮箱</TableHead><TableHead>状态</TableHead><TableHead>两步验证</TableHead><TableHead>创建时间</TableHead><TableHead><span class="sr-only">操作</span></TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="item in admins" :key="item.userId">
                <TableCell class="font-medium">{{ item.name }}</TableCell><TableCell class="text-sm text-muted-foreground">{{ item.email }}</TableCell>
                <TableCell><Badge :variant="item.status === 'ACTIVE' ? 'secondary' : 'outline'">{{ item.status === 'ACTIVE' ? '活动' : '已停用' }}</Badge></TableCell>
                <TableCell>{{ item.twoFactorEnabled ? '已启用' : '未启用' }}</TableCell>
                <TableCell class="whitespace-nowrap text-sm">{{ formatDate(item.createdAt) }}</TableCell>
                <TableCell class="whitespace-nowrap text-right"><Button variant="ghost" size="sm" :disabled="updating === item.userId" @click="setStatus(item)">{{ item.status === 'ACTIVE' ? '停用' : '启用' }}</Button></TableCell>
              </TableRow>
              <TableRow v-if="!loading && !admins.length"><TableCell colspan="6" class="h-28 text-center text-muted-foreground">暂无管理员账号。</TableCell></TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorCode } from "@/lib/app-error";
import { runTelefunc } from "@/lib/telefunc-client";
import { onGetAdminProfiles, onSetAdminStatus } from "@/server/admin.telefunc";

type AdminProfile = Awaited<ReturnType<typeof onGetAdminProfiles>>[number];
const admins = ref<AdminProfile[]>([]);
const loading = ref(false);
const updating = ref<string | null>(null);
const error = ref<string | null>(null);

async function loadAdmins() {
  loading.value = true;
  error.value = null;
  try { admins.value = await onGetAdminProfiles(); } catch (cause) { error.value = messageFor(cause); } finally { loading.value = false; }
}

async function setStatus(item: AdminProfile) {
  updating.value = item.userId;
  error.value = null;
  try {
    await runTelefunc(() => onSetAdminStatus({ userId: item.userId, status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }), { successMessage: item.status === "ACTIVE" ? "管理员已停用。" : "管理员已启用。", notifyError: false });
    await loadAdmins();
  } catch (cause) { error.value = messageFor(cause); } finally { updating.value = null; }
}

function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function messageFor(cause: unknown) {
  return ({ ADMIN_ACCESS_REQUIRED: "管理员身份已失效，请重新登录。", ADMIN_NOT_FOUND: "管理员账号不存在。", ADMIN_SELF_STATUS_CHANGE_FORBIDDEN: "不能停用自己的管理员权限。", LAST_ACTIVE_ADMIN_REQUIRED: "系统必须保留至少一名活动管理员。", ADMIN_STATUS_CHANGED_RETRY: "管理员状态已被其他操作更新，请刷新后重试。" } as Record<string, string>)[errorCode(cause)] ?? "操作失败，请稍后重试。";
}

onMounted(loadAdmins);
</script>
