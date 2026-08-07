<template>
  <section class="flex w-full flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">媒体存储</h1>
        <p class="mt-1 text-sm text-muted-foreground">配置 S3 兼容存储。访问密钥仅通过 Worker Secret 引用。</p>
      </div>
      <Button :disabled="loading" @click="loadConfig">刷新数据</Button>
    </div>

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
      <CardHeader><div class="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>媒体文件</CardTitle><CardDescription>已上传的媒体对象。</CardDescription></div><Button variant="outline" :disabled="loadingMedia" @click="loadMedia">刷新列表</Button></div></CardHeader>
      <CardContent><div class="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>预览</TableHead><TableHead>文件名</TableHead><TableHead>文件 Key</TableHead><TableHead>类型</TableHead><TableHead>大小</TableHead><TableHead>上传时间</TableHead><TableHead><span class="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody><TableRow v-for="item in media" :key="item.id"><TableCell><a :href="item.url" target="_blank" rel="noreferrer"><img :src="item.thumbnailUrl || item.url" :alt="item.originalName" class="size-12 rounded-md border object-cover" /></a></TableCell><TableCell class="max-w-64 truncate font-medium">{{ item.originalName }}</TableCell><TableCell class="max-w-64 truncate font-mono text-xs text-muted-foreground">{{ item.fileKey }}</TableCell><TableCell>{{ item.mimeType }}</TableCell><TableCell>{{ formatSize(item.fileSize) }}</TableCell><TableCell class="whitespace-nowrap text-sm">{{ formatDate(item.uploadedAt) }}</TableCell><TableCell class="text-right"><Button variant="ghost" size="sm" :disabled="deleting === item.id" @click="deleteItem(item.id)">{{ deleting === item.id ? "删除中..." : "删除" }}</Button></TableCell></TableRow><TableRow v-if="!loadingMedia && !media.length"><TableCell colspan="7" class="h-28 text-center text-muted-foreground">暂无媒体文件。</TableCell></TableRow></TableBody></Table></div></CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorCode } from "@/lib/app-error";
import { runTelefunc } from "@/lib/telefunc-client";
import { onDeleteMedia, onGetMedia, onGetS3Config, onSaveS3Config, onUploadMedia } from "@/server/media/admin.telefunc";

const configJson = ref(JSON.stringify({ endpoint: "https://s3.example.com", region: "auto", bucket: "cffk-media", accessKeyId: { secret: "S3_ACCESS_KEY_ID" }, secretAccessKey: { secret: "S3_SECRET_ACCESS_KEY" }, publicBaseUrl: "https://cdn.example.com", forcePathStyle: false }, null, 2));
const updatedAt = ref<Date | string | number | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const media = ref<Awaited<ReturnType<typeof onGetMedia>>["items"]>([]);
const loadingMedia = ref(false);
const uploading = ref(false);
const deleting = ref<number | null>(null);
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function loadConfig() {
  loading.value = true;
  error.value = null;
  try {
    const result = await onGetS3Config();
    if (result) { configJson.value = result.configJson; updatedAt.value = result.updatedAt; }
  } catch (cause) { error.value = messageFor(cause); } finally { loading.value = false; }
}

async function loadMedia() {
  loadingMedia.value = true;
  try { media.value = (await onGetMedia()).items; } catch (cause) { error.value = messageFor(cause); } finally { loadingMedia.value = false; }
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
  } catch (cause) { error.value = messageFor(cause); } finally { uploading.value = false; }
}

async function deleteItem(id: number) {
  deleting.value = id;
  error.value = null;
  try { await runTelefunc(() => onDeleteMedia({ id }), { successMessage: "媒体文件已删除。", notifyError: false }); await loadMedia(); } catch (cause) { error.value = messageFor(cause); } finally { deleting.value = null; }
}

async function saveConfig() {
  saving.value = true;
  error.value = null;
  try {
    const result = await runTelefunc(() => onSaveS3Config({ configJson: configJson.value }), { successMessage: "媒体存储配置已保存。", notifyError: false });
    updatedAt.value = result.updatedAt;
  } catch (cause) { error.value = messageFor(cause); } finally { saving.value = false; }
}

function readAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("MEDIA_FILE_READ_FAILED")); reader.onerror = () => reject(new Error("MEDIA_FILE_READ_FAILED")); reader.readAsDataURL(file); }); }
function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function formatSize(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(2)} MB`; }
function messageFor(cause: unknown) { return ({ ADMIN_ACCESS_REQUIRED: "管理员身份已失效，请重新登录。", S3_CONFIG_REQUIRED: "请填写 S3 配置 JSON。", S3_CONFIG_INVALID: "S3 配置无效，请检查 endpoint、bucket、region 与 Secret 引用。", S3_CONFIG_NOT_FOUND: "请先保存 S3 存储配置。", S3_SECRET_UNAVAILABLE: "未找到 S3 Worker Secret，请检查 Secret 引用。", S3_UPLOAD_FAILED: "对象存储上传失败。", S3_DELETE_FAILED: "对象存储删除失败。", MEDIA_NAME_REQUIRED: "文件名不能为空。", MEDIA_TYPE_NOT_ALLOWED: "仅支持 JPEG、PNG、WebP 或 GIF 图片。", MEDIA_FILE_SIZE_INVALID: "图片必须小于 10MB。", MEDIA_FILE_READ_FAILED: "无法读取图片文件。", MEDIA_NOT_FOUND: "媒体文件不存在。" } as Record<string, string>)[errorCode(cause)] ?? "操作失败，请稍后重试。"; }

onMounted(() => { void loadConfig(); void loadMedia(); });
</script>
