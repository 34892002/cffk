<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader>
      <template #actions>
        <Button variant="outline" size="sm" :disabled="loading" aria-label="刷新" title="刷新" @click="loadConfig"><RefreshCwIcon :class="loading ? 'animate-spin' : ''" />刷新</Button>
      </template>
    </AdminPageHeader>

    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Card>
      <CardHeader>
        <CardTitle>S3 兼容存储配置</CardTitle>
        <CardDescription>保存后仅用于后续媒体上传服务；不会将访问密钥写入 D1。</CardDescription>
      </CardHeader>
      <form @submit.prevent="saveConfig">
        <CardContent class="grid max-w-4xl gap-4">
          <label class="grid gap-2 text-sm font-medium">配置 JSON<Textarea v-model="configJson" rows="16" spellcheck="false" class="min-h-72 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <p class="text-xs leading-5 text-muted-foreground">示例：`{ "endpoint": "https://s3.example.com", "region": "auto", "bucket": "cffk-media", "accessKeyId": { "secret": "S3_ACCESS_KEY_ID" }, "secretAccessKey": { "secret": "S3_SECRET_ACCESS_KEY" }, "publicBaseUrl": "https://cdn.example.com", "forcePathStyle": false }`。</p>
          <p v-if="updatedAt" class="text-xs text-muted-foreground">上次保存：{{ formatDate(updatedAt) }}</p>
        </CardContent>
        <CardFooter><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存配置" }}</Button></CardFooter>
      </form>
    </Card>

    <Card>
      <CardHeader><CardTitle>上传图片</CardTitle><CardDescription>支持 JPEG、PNG、WebP 和 GIF，单个文件最大 10MB。</CardDescription></CardHeader>
      <CardContent class="flex flex-wrap items-center gap-3"><Input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="max-w-full text-sm" @change="onFileChange" /><Button :disabled="uploading || !selectedFile" @click="uploadSelectedFile">{{ uploading ? "上传中..." : "上传图片" }}</Button></CardContent>
    </Card>

    <Card>
      <CardHeader><div class="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>媒体文件</CardTitle><CardDescription>已上传的媒体对象。</CardDescription></div><Button variant="outline" size="sm" :disabled="loadingMedia" aria-label="刷新" title="刷新" @click="loadMedia"><RefreshCwIcon :class="loadingMedia ? 'animate-spin' : ''" />刷新</Button></div></CardHeader>
      <CardContent>
        <AdminDataTable :columns="mediaColumns" :rows="media" row-key="id" empty-text="暂无媒体文件。">
          <template #cell-preview="{ row }"><a :href="row.url" target="_blank" rel="noreferrer"><img :src="row.thumbnailUrl || row.url" :alt="row.originalName" class="size-12 rounded-md border object-cover" /></a></template>
          <template #cell-originalName="{ row }"><span class="block max-w-64 truncate font-medium">{{ row.originalName }}</span></template>
          <template #cell-fileKey="{ row }"><span class="block max-w-64 truncate font-mono text-xs text-muted-foreground">{{ row.fileKey }}</span></template>
          <template #cell-fileSize="{ row }">{{ formatSize(row.fileSize) }}</template>
          <template #cell-uploadedAt="{ row }"><span class="whitespace-nowrap text-sm">{{ formatDate(row.uploadedAt) }}</span></template>
          <template #actions="{ row }"><Button variant="ghost" size="sm" :disabled="deleting === row.id" @click="deleteItem(row.id)">{{ deleting === row.id ? "删除中..." : "删除" }}</Button></template>
        </AdminDataTable>
      </CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onDeleteMedia, onGetMedia, onGetS3Config, onSaveS3Config, onUploadMedia } from "@/server/media/admin.telefunc";

const configJson = ref(JSON.stringify({ endpoint: "https://s3.example.com", region: "auto", bucket: "cffk-media", accessKeyId: { secret: "S3_ACCESS_KEY_ID" }, secretAccessKey: { secret: "S3_SECRET_ACCESS_KEY" }, publicBaseUrl: "https://cdn.example.com", forcePathStyle: false }, null, 2));
const updatedAt = ref<Date | string | number | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
type MediaItem = Awaited<ReturnType<typeof onGetMedia>>["items"][number];

const mediaColumns: AdminTableColumn<MediaItem>[] = [
  { key: "preview", label: "预览", class: "w-20" },
  { key: "originalName", label: "文件名" },
  { key: "fileKey", label: "文件 Key" },
  { key: "mimeType", label: "类型" },
  { key: "fileSize", label: "大小", class: "whitespace-nowrap" },
  { key: "uploadedAt", label: "上传时间", class: "whitespace-nowrap" },
];

const media = ref<MediaItem[]>([]);
const loadingMedia = ref(false);
const uploading = ref(false);
const deleting = ref<number | null>(null);
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function loadConfig() {
  loading.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onGetS3Config(), { notifyError: false });
    if (result) { configJson.value = result.configJson; updatedAt.value = result.updatedAt; }
  } catch (cause) { error.value = userErrorMessage(cause); } finally { loading.value = false; }
}

async function loadMedia() {
  loadingMedia.value = true;
  try { media.value = (await runTelefunc(() => onGetMedia(), { notifyError: false })).items; } catch (cause) { error.value = userErrorMessage(cause); } finally { loadingMedia.value = false; }
}

function onFileChange(event: Event) { selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null; }

async function uploadSelectedFile() {
  const file = selectedFile.value;
  if (!file) return;
  uploading.value = true;
  error.value = null;
  try {
    const dataUrl = await readAsDataUrl(file);
    await runTelefunc(() => onUploadMedia({ originalName: file.name, dataUrl }), { successMessage: "图片已上传。", notifyError: false });
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = "";
    await loadMedia();
  } catch (cause) { error.value = userErrorMessage(cause); } finally { uploading.value = false; }
}

async function deleteItem(id: number) {
  deleting.value = id;
  error.value = null;
  try { await runTelefunc(() => onDeleteMedia({ id }), { successMessage: "媒体文件已删除。", notifyError: false }); await loadMedia(); } catch (cause) { error.value = userErrorMessage(cause); } finally { deleting.value = null; }
}

async function saveConfig() {
  saving.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onSaveS3Config({ configJson: configJson.value }), { successMessage: "媒体存储配置已保存。", notifyError: false });
    updatedAt.value = result.updatedAt;
  } catch (cause) { error.value = userErrorMessage(cause); } finally { saving.value = false; }
}

function readAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("MEDIA_FILE_READ_FAILED")); reader.onerror = () => reject(new Error("MEDIA_FILE_READ_FAILED")); reader.readAsDataURL(file); }); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function formatSize(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(2)} MB`; }


onMounted(() => { void loadConfig(); void loadMedia(); });
</script>
