<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions>
        <div class="ml-auto flex items-center gap-2">
          <Button variant="outline" :disabled="loading" @click="loadAll"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
          <Button @click="configOpen = true">存储配置</Button>
        </div>
      </template>
    </AdminPageHeader>

    <Alert v-if="!canUpload" class="border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400">
      <AlertTitle>尚未配置媒体存储</AlertTitle>
      <AlertDescription>请先配置 S3 连接信息，并填写 Access Key ID 和 Secret Access Key。访问密钥仅保存在 D1 并且不会返回浏览器；缺少任一项时上传区会保持禁用。</AlertDescription>
    </Alert>

    <Card>
      <CardHeader class="items-center text-center"><CardTitle>上传媒体</CardTitle><CardDescription>支持 JPEG、PNG、WebP、GIF 和 PDF；图片最大 3 MiB，PDF 最大 10 MiB。</CardDescription></CardHeader>
      <CardContent>
        <div class="mx-auto max-w-4xl p-6 text-center">
          <input ref="fileInput" class="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" :disabled="!canUpload || uploading" @change="selectFiles" />
          <div
            class="mx-auto flex min-h-44 max-w-2xl cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 transition-colors"
            :class="dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'"
            role="button"
            tabindex="0"
            @dragenter.prevent="!uploading && (dragging = true)"
            @dragover.prevent="!uploading && (dragging = true)"
            @dragleave.prevent="dragging = false"
            @drop.prevent="dropFile"
            @click="openFilePicker"
            @keydown.enter.prevent="openFilePicker"
            @keydown.space.prevent="openFilePicker"
          >
            <FolderOpenIcon class="mb-3 size-14 text-primary" :class="{ 'opacity-50': !canUpload || uploading }" :stroke-width="1.5" />
            <p class="text-lg font-semibold" :class="{ 'opacity-50': !canUpload || uploading }">点击或拖拽上传图片或 PDF</p>
            <p class="mt-3 inline-flex items-center gap-1.5 text-sm text-primary" :class="{ 'opacity-50': !canUpload || uploading }"><ClipboardPasteIcon class="size-4" />也可以使用 Ctrl+V 粘贴剪贴板中的图片</p>
          </div>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button :disabled="!pendingCount || !canUpload || uploading" @click="upload">{{ uploading ? `${completedCount}/${batchTotal} 个文件，${progress}%` : `上传 ${pendingCount} 个文件` }}</Button>
            <label class="inline-flex items-center gap-2 text-sm"><Checkbox v-model="webpEnabled" :disabled="!webpSupported || uploading" />自动压缩 JPEG、PNG 为 WebP</label>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">可一次选择或拖入多个文件，系统会按顺序上传。转换失败或文件变大时会自动上传原文件。</p>
          <div v-if="queue.length" class="mx-auto mt-4 max-w-xl space-y-1 text-left text-sm">
            <div v-for="item in queue" :key="item.id" class="flex items-center justify-between gap-3 rounded border px-3 py-2">
              <span class="min-w-0 truncate">{{ item.file.name }} · {{ formatSize(item.file.size) }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ item.id === currentUploadId && uploading ? `${progress}% 上传中` : uploadStatusText(item.status) }}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <AdminDataTable :columns="columns" :rows="data.items" row-key="id" empty-text="暂无媒体文件。">
      <template #toolbar><div class="flex flex-wrap items-center gap-2"><Input v-model="draftKeyword" class="h-8 w-56 shrink-0" placeholder="搜索文件名" @keyup.enter="search" /><Select v-model="draftMimeType"><SelectTrigger size="sm" class="w-40 shrink-0"><SelectValue placeholder="全部类型" /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="image/">图片</SelectItem><SelectItem value="application/pdf">PDF</SelectItem></SelectContent></Select><Button size="sm" @click="search">查询</Button><Button variant="outline" size="sm" @click="resetFilters">重置</Button></div></template>
      <template #cell-preview="{ row }"><Button variant="ghost" size="sm" @click="preview = row">预览</Button></template>
      <template #cell-originalName="{ row }"><span class="block max-w-64 truncate">{{ row.originalName }}</span></template>
      <template #cell-fileSize="{ row }">{{ formatSize(row.fileSize) }}</template>
      <template #cell-uploadedAt="{ row }">{{ formatDate(row.uploadedAt) }}</template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="copy(row.url)">复制 URL</Button><Button variant="ghost" size="sm" @click="toDelete = row">删除</Button></template>
      <template #pagination><Pagination :total="data.total" :page="data.page" :page-size="data.pageSize" :page-size-options="[10, 20, 50, 100]" @update:page="goPage" @update:page-size="changePageSize" /></template>
    </AdminDataTable>

    <Dialog v-model:open="configOpen">
      <DialogContent class="max-h-[calc(100dvh-2rem)] sm:max-w-215 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" @interact-outside.prevent @escape-key-down.prevent>
        <DialogHeader class="border-b px-6 py-5 pr-14">
          <DialogTitle>媒体存储配置</DialogTitle>
          <DialogDescription>S3 兼容存储负责保存文件。访问密钥保存在 D1，仅服务端使用，读取配置时不会返回浏览器。</DialogDescription>
        </DialogHeader>
        <form class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" novalidate @submit.prevent="saveConfig">
          <div class="min-h-0 overflow-y-auto px-6 py-5">
            <FieldGroup class="gap-5">
              <FieldSet class="gap-4">
                <FieldLegend>存储连接</FieldLegend>
                <VeeField v-slot="{ componentField, errors }" name="endpoint"><Field :data-invalid="errors.length > 0"><FieldLabel>S3 端点</FieldLabel><Input v-bind="componentField" placeholder="https://s3.example.com" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField, errors }" name="bucket"><Field :data-invalid="errors.length > 0"><FieldLabel>存储桶名称</FieldLabel><Input v-bind="componentField" placeholder="用于保存媒体对象的 Bucket" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field></VeeField>
                <VeeField v-slot="{ componentField }" name="region"><Field><FieldLabel>区域</FieldLabel><Input v-bind="componentField" placeholder="例如：auto" /></Field></VeeField>
                <VeeField v-slot="{ componentField }" name="forcePathStyle"><Field orientation="horizontal"><FieldLabel>使用 Path-style 地址</FieldLabel><Switch v-bind="componentField" /></Field></VeeField>
              </FieldSet>
              <FieldSeparator />
              <FieldSet class="gap-4">
                <FieldLegend>访问凭据</FieldLegend>
                <FieldDescription>凭据仅在保存或测试时发送至服务端，并保存在 D1。已保存的值不会回显；留空会保留现有值。</FieldDescription>
                <VeeField v-slot="{ componentField }" name="accessKeyId"><Field><FieldLabel>Access Key ID</FieldLabel><Input v-bind="componentField" type="password" autocomplete="off" placeholder="已配置时留空即可保留" /></Field></VeeField>
                <VeeField v-slot="{ componentField }" name="secretAccessKey"><Field><FieldLabel>Secret Access Key</FieldLabel><Input v-bind="componentField" type="password" autocomplete="new-password" placeholder="已配置时留空即可保留" /></Field></VeeField>
              </FieldSet>
              <FieldSeparator />
              <FieldSet class="gap-4">
                <FieldLegend>对象路径与缓存</FieldLegend>
                <VeeField v-slot="{ componentField }" name="pathPrefix"><Field><FieldLabel>路径前缀</FieldLabel><Input v-bind="componentField" placeholder="例如：media" /></Field></VeeField>
                <VeeField v-slot="{ componentField }" name="cacheControl"><Field><FieldLabel>缓存策略</FieldLabel><Input v-bind="componentField" /></Field></VeeField>
              </FieldSet>
            </FieldGroup>
          </div>
          <DialogFooter class="border-t px-6 py-4"><Button type="button" variant="outline" @click="configOpen = false">取消</Button><Button type="button" variant="outline" :disabled="saving" @click="testConfig">测试连接</Button><Button type="submit" :disabled="saving">保存配置</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog :open="Boolean(preview && preview.mimeType.startsWith('image/'))" @update:open="(open) => { if (!open) preview = null }">
      <DialogContent :show-close-button="false" class="w-fit! max-w-[calc(100vw-2rem)]! border-0 bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)]!" @interact-outside="preview = null">
        <DialogTitle class="sr-only">{{ preview?.originalName }}</DialogTitle>
        <div class="relative inline-flex">
          <img v-if="preview" :src="preview.url" :alt="preview.originalName" class="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain sm:max-w-[calc(100vw-4rem)]" />
          <DialogClose as-child><Button type="button" variant="ghost" size="icon" class="absolute right-2 top-2 size-10 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white" aria-label="关闭图片预览"><XIcon /></Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog :open="Boolean(preview && !preview.mimeType.startsWith('image/'))" @update:open="(open) => { if (!open) preview = null }">
      <DialogContent class="w-[calc(100%-2rem)] max-w-3xl">
        <DialogHeader><DialogTitle>{{ preview?.originalName }}</DialogTitle></DialogHeader>
        <iframe v-if="preview" :src="preview.url" class="h-[70vh] w-full" title="媒体预览" />
        <DialogFooter><Button type="button" @click="preview = null">关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog :open="Boolean(toDelete)" @update:open="(open) => { if (!open) toDelete = null }">
      <DialogContent class="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader><DialogTitle>删除媒体文件？</DialogTitle><DialogDescription>将永久删除 S3 对象与 D1 媒体记录，且不可恢复。</DialogDescription></DialogHeader>
        <DialogFooter><Button type="button" variant="outline" @click="toDelete = null">取消</Button><Button type="button" variant="destructive" :disabled="deleting" @click="remove">确认删除</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ClipboardPasteIcon, FolderOpenIcon, RefreshCwIcon, XIcon } from "@lucide/vue";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Pagination from "@/components/ui/pagination/Pagination.vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Field as VeeField, useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { toast } from "vue-sonner";
import { deleteMedia, mediaApiUserError, mediaApiError } from "@/lib/media-api";
import { formatDateInTimezone, useSiteTimezone } from "@/lib/site-timezone";
import { runTelefunc } from "@/lib/telefunc-client";
import type { MediaConfigInput } from "@/server/media/types";
import { onGetMedia, onGetMediaConfig, onSaveMediaConfig, onTestMediaStorage } from "@/server/media/admin.telefunc";

type Row = Awaited<ReturnType<typeof onGetMedia>>["items"][number];
type UploadStatus = "queued" | "uploading" | "success" | "error";
type UploadItem = { id: string; file: File; status: UploadStatus };
const columns: AdminTableColumn<Row>[] = [{ key: "preview", label: "预览" }, { key: "originalName", label: "文件名" }, { key: "mimeType", label: "类型" }, { key: "fileSize", label: "大小" }, { key: "uploadedAt", label: "上传时间" }];
const data = reactive<Awaited<ReturnType<typeof onGetMedia>>>({ items: [], total: 0, page: 1, pageSize: 10 });
const config = reactive<Awaited<ReturnType<typeof onGetMediaConfig>>>({ configured: false, values: null, credentialStatus: { accessKeyConfigured: false, secretKeyConfigured: false }, updatedAt: null });
const loading = ref(false), configOpen = ref(false), uploading = ref(false), saving = ref(false), deleting = ref(false), progress = ref(0), completedCount = ref(0), batchTotal = ref(0), currentUploadId = ref(""), queue = ref<UploadItem[]>([]), fileInput = ref<HTMLInputElement | null>(null), draftKeyword = ref(""), draftMimeType = ref("all"), keyword = ref(""), mimeType = ref("all"), preview = ref<Row | null>(null), toDelete = ref<Row | null>(null), dragging = ref(false), webpSupported = ref(false), webpEnabled = ref(false);
const canUpload = computed(() => config.configured && config.credentialStatus.accessKeyConfigured && config.credentialStatus.secretKeyConfigured);
const pendingCount = computed(() => queue.value.filter((item) => item.status !== "success").length);
const timezone = useSiteTimezone();
const { handleSubmit, resetForm, values } = useForm({ validationSchema: toTypedSchema(z.object({ endpoint: z.string().url(), bucket: z.string().min(1), accessKeyId: z.string().optional(), secretAccessKey: z.string().optional(), region: z.string().min(1), pathPrefix: z.string().min(1), cacheControl: z.string().min(1), forcePathStyle: z.boolean() })), initialValues: { endpoint: "", bucket: "", accessKeyId: "", secretAccessKey: "", region: "auto", pathPrefix: "media", cacheControl: "public, max-age=31536000, s-maxage=31536000, immutable", forcePathStyle: false } });
async function loadAll() { loading.value = true; try { const [c, list] = await Promise.all([runTelefunc(() => onGetMediaConfig(), { notifyError: false }), runTelefunc(() => onGetMedia({ keyword: keyword.value || undefined, mimeType: mimeType.value === "all" ? undefined : mimeType.value as "image/" | "application/pdf", page: data.page, pageSize: data.pageSize }), { notifyError: false })]); Object.assign(config, c); Object.assign(data, list); if (c.values) resetForm({ values: { ...c.values, accessKeyId: "", secretAccessKey: "" } }); } catch { /* runTelefunc 已显示脱敏错误。 */ } finally { loading.value = false; } }
function search() { keyword.value = draftKeyword.value; mimeType.value = draftMimeType.value; data.page = 1; void loadAll(); }
function resetFilters() { draftKeyword.value = ""; draftMimeType.value = "all"; search(); }
function goPage(page: number) { data.page = page; void loadAll(); }
function changePageSize(pageSize: number) { data.pageSize = pageSize; data.page = 1; void loadAll(); }
function openFilePicker() {
  if (!canUpload.value || uploading.value) return;
  fileInput.value?.click();
}
function addFiles(files: File[]) {
  if (uploading.value) return;
  const uniqueFiles = new Map<string, File>();
  for (const file of files) uniqueFiles.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  queue.value = Array.from(uniqueFiles.values()).map((file) => ({ id: `${file.name}:${file.size}:${file.lastModified}:${crypto.randomUUID()}`, file, status: "queued" }));
}
function selectFiles(event: Event) {
  addFiles(Array.from((event.target as HTMLInputElement).files ?? []));
  (event.target as HTMLInputElement).value = "";
}
function dropFile(event: DragEvent) {
  dragging.value = false;
  if (uploading.value) return;
  addFiles(Array.from(event.dataTransfer?.files ?? []));
}
function uploadStatusText(status: UploadStatus) {
  return { queued: "等待上传", uploading: "上传中", success: "已完成", error: "失败" }[status];
}
function setQueueStatus(id: string, status: UploadStatus) {
  queue.value = queue.value.map((item) => item.id === id ? { ...item, status } : item);
}
async function optimizeFile(file: File) { if (!webpEnabled.value || !["image/jpeg", "image/png"].includes(file.type)) return file; try { const bitmap = await createImageBitmap(file); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close(); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.7)); if (!blob || blob.size >= file.size) return file; return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" }); } catch { toast.info("图片压缩失败，已上传原文件。"); return file; } }
function uploadOne(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress.value = Math.round(event.loaded / event.total * 100); };
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        const response = new Response(xhr.responseText, { status: xhr.status, headers: { "content-type": xhr.getResponseHeader("content-type") ?? "text/plain" } });
        reject(await mediaApiError(response));
      }
    };
    xhr.onerror = () => reject(new Error("接口异常，请稍后重试。"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
async function upload() {
  if (!queue.value.length || !canUpload.value) return;
  uploading.value = true;
  const pendingItems = queue.value.filter((item) => item.status !== "success");
  batchTotal.value = pendingItems.length;
  completedCount.value = 0;
  let successCount = 0;
  let errorCount = 0;
  try {
    for (const item of pendingItems) {
      currentUploadId.value = item.id;
      setQueueStatus(item.id, "uploading");
      progress.value = 0;
      try {
        await uploadOne(await optimizeFile(item.file));
        setQueueStatus(item.id, "success");
        completedCount.value += 1;
        successCount += 1;
      } catch (cause) {
        setQueueStatus(item.id, "error");
        completedCount.value += 1;
        errorCount += 1;
        toast.error(`${item.file.name}: ${mediaApiUserError(cause)}`);
      }
    }
    if (successCount > 0) toast.success(`${successCount} 个文件上传成功${errorCount ? `，${errorCount} 个失败` : "。"}`);
    await loadAll();
  } finally {
    uploading.value = false;
    progress.value = 0;
    currentUploadId.value = "";
  }
}
const saveConfig = handleSubmit(async (input) => { saving.value = true; try { await runTelefunc(() => onSaveMediaConfig(input), { successMessage: "媒体存储配置已保存。" }); configOpen.value = false; await loadAll(); } catch { /* runTelefunc 已显示脱敏错误。 */ } finally { saving.value = false; } });
async function testConfig() { try { await runTelefunc(() => onTestMediaStorage(values as MediaConfigInput), { successMessage: "存储连接测试成功。" }); } catch { /* runTelefunc 已显示脱敏错误。 */ } }
async function remove() { if (!toDelete.value) return; deleting.value = true; try { await deleteMedia(toDelete.value.id); toast.success("媒体文件已删除。"); toDelete.value = null; await loadAll(); } catch (cause) { toast.error(mediaApiUserError(cause)); } finally { deleting.value = false; } }
async function copy(url: string) { await navigator.clipboard.writeText(url); toast.success("URL 已复制。"); }
function formatSize(value: number) { return value < 1048576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1048576).toFixed(2)} MB`; }
function formatDate(value: Date | string) { return formatDateInTimezone(value, timezone.value); }
function handleDocumentPaste(event: ClipboardEvent) {
  if (uploading.value) return;
  addFiles(Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/")));
}
onMounted(() => {
  const canvas = document.createElement("canvas");
  webpSupported.value = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  webpEnabled.value = webpSupported.value;
  document.addEventListener("paste", handleDocumentPaste);
  void loadAll();
});
onBeforeUnmount(() => document.removeEventListener("paste", handleDocumentPaste));
</script>
