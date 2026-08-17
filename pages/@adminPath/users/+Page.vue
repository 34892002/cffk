<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <AdminDataTable :columns="columns" :rows="users" row-key="id" empty-text="没有符合条件的用户。">
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <Input v-model="query" class="h-8 w-64" placeholder="昵称或邮箱" @keyup.enter="search" />
          <Button size="sm" :disabled="loading" @click="search">查询</Button>
          <Button variant="outline" size="sm" :disabled="loading" @click="resetFilters">重置</Button>
          <Button size="sm" :disabled="loading" @click="openCreateDialog"><UserPlusIcon />添加用户</Button>
        </div>
        <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadUsers"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
      </template>

      <template #cell-name="{ value }"><span class="font-medium">{{ value }}</span></template>
      <template #cell-email="{ value }"><span class="text-sm text-muted-foreground">{{ value }}</span></template>
      <template #cell-status="{ row }"><Badge :variant="row.disabledAt ? 'destructive' : 'default'">{{ row.disabledAt ? "已禁用" : "正常" }}</Badge></template>
      <template #cell-emailVerified="{ row }"><Badge :variant="row.emailVerified ? 'secondary' : 'outline'">{{ row.emailVerified ? "已验证" : "未验证" }}</Badge></template>
      <template #cell-twoFactorEnabled="{ row }"><Badge :variant="row.twoFactorEnabled ? 'secondary' : 'outline'">{{ row.twoFactorEnabled ? "已开启" : "未开启" }}</Badge></template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</span></template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-1">
          <Button variant="ghost" size="sm" :disabled="changingUserId === row.id || editing" @click="openEditDialog(row)"><PencilIcon />编辑</Button>
          <Button variant="ghost" size="sm" :disabled="changingUserId === row.id || editing" @click="requestStatusChange(row)">{{ row.disabledAt ? "启用" : "禁用" }}</Button>
        </div>
      </template>
      <template #pagination><Pagination :total="total" :page="page" :page-size="pageSize" :page-size-options="[10, 20, 50, 100]" @update:page="changePage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>

    <Dialog v-model:open="createDialogOpen">
      <DialogContent class="max-w-md" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader><DialogTitle>添加用户</DialogTitle><DialogDescription>新用户为普通用户，邮箱将直接视为已验证，不会发送验证邮件。</DialogDescription></DialogHeader>
        <VeeForm ref="createFormRef" class="grid gap-4" as="form" novalidate :validation-schema="createUserSchema" :initial-values="emptyCreateUserForm" @submit="createUser">
          <FieldGroup>
            <VeeField v-slot="{ componentField, errors }" name="name" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="admin-user-name">昵称</FieldLabel><Input id="admin-user-name" v-bind="componentField" autocomplete="name" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="admin-user-email">邮箱</FieldLabel><Input id="admin-user-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            <VeeField v-slot="{ componentField, errors }" name="password" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="admin-user-password">初始密码</FieldLabel><Input id="admin-user-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
          </FieldGroup>
          <DialogFooter><Button type="button" variant="outline" :disabled="creating" @click="createDialogOpen = false">取消</Button><Button type="submit" :disabled="creating">{{ creating ? "添加中..." : "添加用户" }}</Button></DialogFooter>
        </VeeForm>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="max-w-md" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader><DialogTitle>编辑用户</DialogTitle><DialogDescription>修改邮箱或重置密码后，该用户的所有现有会话将立即失效，需要重新登录。</DialogDescription></DialogHeader>
        <VeeForm ref="editFormRef" class="grid gap-4" as="form" novalidate :validation-schema="editUserSchema" :initial-values="emptyEditUserForm" @submit="updateUser">
          <FieldGroup>
            <VeeField v-slot="{ componentField, errors }" name="name" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="edit-admin-user-name">昵称</FieldLabel><Input id="edit-admin-user-name" v-bind="componentField" autocomplete="name" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            <VeeField v-slot="{ componentField, errors }" name="email" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="edit-admin-user-email">邮箱</FieldLabel><Input id="edit-admin-user-email" v-bind="componentField" type="email" autocomplete="email" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
            <VeeField v-slot="{ componentField, errors }" name="password" :validate-on-input="true"><Field :data-invalid="errors.length > 0"><FieldLabel for="edit-admin-user-password">重置密码</FieldLabel><Input id="edit-admin-user-password" v-bind="componentField" type="password" autocomplete="new-password" :aria-invalid="errors.length > 0" /><FieldDescription>留空则不修改密码。</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
          </FieldGroup>
          <DialogFooter><Button type="button" variant="outline" :disabled="editing" @click="editDialogOpen = false">取消</Button><Button type="submit" :disabled="editing">{{ editing ? "保存中..." : "保存修改" }}</Button></DialogFooter>
        </VeeForm>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="statusDialogOpen">
      <DialogContent class="max-w-md"><DialogHeader><DialogTitle>{{ statusTarget?.disabledAt ? "启用用户" : "禁用用户" }}</DialogTitle><DialogDescription>{{ statusTarget?.disabledAt ? `启用“${statusTarget.name}”后，该用户可以重新登录。` : `禁用“${statusTarget?.name}”后，该用户将立即退出所有会话且无法登录；用户资料和历史数据会保留。` }}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" :disabled="changingUserId !== null" @click="statusDialogOpen = false">取消</Button><Button :variant="statusTarget?.disabledAt ? 'default' : 'destructive'" :disabled="changingUserId !== null" @click="confirmStatusChange">{{ changingUserId !== null ? "处理中..." : statusTarget?.disabledAt ? "确认启用" : "确认禁用" }}</Button></DialogFooter></DialogContent>
    </Dialog>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, Form as VeeForm } from "vee-validate";
import { z } from "zod";
import { PencilIcon, RefreshCwIcon, UserPlusIcon } from "@lucide/vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { runTelefunc } from "@/lib/telefunc-client";
import { onCreateAdminUser, onGetAdminUsers, onSetAdminUserDisabled, onUpdateAdminUser } from "@/server/user/admin.telefunc";

type User = Awaited<ReturnType<typeof onGetAdminUsers>>["users"][number];
type CreateUserForm = { name: string; email: string; password: string };
type EditUserForm = { name: string; email: string; password: string };
const emptyCreateUserForm: CreateUserForm = { name: "", email: "", password: "" };
const emptyEditUserForm: EditUserForm = { name: "", email: "", password: "" };
const createUserSchema = toTypedSchema(z.object({
  name: z.string().trim().min(1, "请输入昵称。").max(100, "昵称不能超过 100 个字符。"),
  email: z.string().trim().email("请输入有效邮箱。").max(320, "邮箱地址过长。"),
  password: z.string().min(8, "初始密码至少需要 8 位字符。").max(128, "初始密码不能超过 128 位字符。"),
}));
const editUserSchema = toTypedSchema(z.object({
  name: z.string().trim().min(1, "请输入昵称。").max(100, "昵称不能超过 100 个字符。"),
  email: z.string().trim().email("请输入有效邮箱。").max(320, "邮箱地址过长。"),
  password: z.string().max(128, "密码不能超过 128 位字符。").refine(value => !value || value.length >= 8, "重置密码至少需要 8 位字符。"),
}));
const columns: AdminTableColumn<User>[] = [
  { key: "name", label: "昵称" }, { key: "email", label: "邮箱" }, { key: "status", label: "状态" }, { key: "emailVerified", label: "邮箱验证" }, { key: "twoFactorEnabled", label: "双因素认证" }, { key: "createdAt", label: "注册时间" },
];
const timezone = useSiteTimezone();
const users = ref<User[]>([]); const query = ref(""); const page = ref(1); const pageSize = ref(10); const total = ref(0); const loading = ref(false);
type FormRef<T> = { resetForm: (state?: { values?: T }) => void };
const createDialogOpen = ref(false); const creating = ref(false); const editDialogOpen = ref(false); const editing = ref(false); const editTarget = ref<User | null>(null); const changingUserId = ref<string | null>(null); const statusDialogOpen = ref(false); const statusTarget = ref<User | null>(null);
const createFormRef = ref<FormRef<CreateUserForm> | null>(null);
const editFormRef = ref<FormRef<EditUserForm> | null>(null);

async function loadUsers() { loading.value = true; try { const result = await runTelefunc(() => onGetAdminUsers({ page: page.value, pageSize: pageSize.value, ...(query.value.trim() ? { query: query.value.trim() } : {}) })); users.value = result.users; total.value = result.total; page.value = result.page; } catch { /* runTelefunc owns feedback */ } finally { loading.value = false; } }
function openCreateDialog() { createFormRef.value?.resetForm({ values: emptyCreateUserForm }); createDialogOpen.value = true; }
async function createUser(values: Record<string, unknown>) { const input = values as CreateUserForm; creating.value = true; try { await runTelefunc(() => onCreateAdminUser(input), { successMessage: "用户已添加，邮箱已直接验证。" }); createDialogOpen.value = false; await loadUsers(); } catch { /* runTelefunc owns feedback */ } finally { creating.value = false; } }
function openEditDialog(user: User) { editTarget.value = user; editFormRef.value?.resetForm({ values: { name: user.name, email: user.email, password: "" } }); editDialogOpen.value = true; }
async function updateUser(values: Record<string, unknown>) { const target = editTarget.value; if (!target) return; const input = values as EditUserForm; editing.value = true; try { await runTelefunc(() => onUpdateAdminUser({ userId: target.id, ...input }), { successMessage: "用户资料已更新。" }); editDialogOpen.value = false; editTarget.value = null; await loadUsers(); } catch { /* runTelefunc owns feedback */ } finally { editing.value = false; } }
function requestStatusChange(user: User) { statusTarget.value = user; statusDialogOpen.value = true; }
async function confirmStatusChange() { const target = statusTarget.value; if (!target) return; changingUserId.value = target.id; try { await runTelefunc(() => onSetAdminUserDisabled({ userId: target.id, disabled: !target.disabledAt }), { successMessage: target.disabledAt ? "用户已启用。" : "用户已禁用，现有会话已失效。" }); statusDialogOpen.value = false; statusTarget.value = null; await loadUsers(); } catch { /* runTelefunc owns feedback */ } finally { changingUserId.value = null; } }
function search() { page.value = 1; void loadUsers(); }
function resetFilters() { query.value = ""; search(); }
function changePage(value: number) { page.value = value; void loadUsers(); }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void loadUsers(); }
function formatDate(value: Date | string | number) { return formatDateInTimezone(value, timezone.value); }
onMounted(loadUsers);
</script>
