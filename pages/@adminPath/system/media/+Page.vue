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
      <CardHeader class="items-center text-center"><CardTitle>上传媒体</CardTitle><CardDescription>支持 JPEG、PNG、WebP、GIF 和 PDF；图片最大 10 MiB，PDF 最大 20 MiB。</CardDescription></CardHeader>
      <CardContent>
        <div class="mx-auto max-w-4xl rounded-lg border border-dashed p-6 text-center" :class="dragging ? 'border-primary bg-muted/50' : 'border-border'" @dragenter.prevent="dragging = true" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
          <div class="flex flex-wrap items-center justify-center gap-3">
            <Input class="max-w-xl" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" :disabled="!canUpload || uploading" @change="selectFile" />
            <Button :disabled="!selectedFile || !canUpload || uploading" @click="upload">{{ uploading ? `${progress}% 上传中` : '上传文件' }}</Button>
          </div>
          <label class="mt-4 inline-flex items-center gap-2 text-sm"><Checkbox v-model="webpEnabled" :disabled="!webpSupported || uploading" />自动压缩 JPEG、PNG 为 WebP</label>
          <p class="mt-2 text-xs text-muted-foreground">也可将单个文件拖入此区域。转换失败或文件变大时会自动上传原文件。</p>
          <p v-if="selectedFile" class="mt-3 text-sm text-muted-foreground">{{ selectedFile.name }} · {{ formatSize(selectedFile.size) }}</p>
        </div>
      </CardContent>
    </Card>

    <AdminDataTable :columns="columns" :rows="data.items" row-key="id" empty-text="暂无媒体文件。">
      <template #toolbar><div class="flex flex-wrap gap-3"><Input v-model="keyword" class="min-w-56 flex-1" placeholder="搜索文件名" @keyup.enter="search" /><Select v-model="mimeType"><SelectTrigger class="w-40"><SelectValue placeholder="全部类型" /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="image/">图片</SelectItem><SelectItem value="application/pdf">PDF</SelectItem></SelectContent></Select><Button variant="outline" @click="search">搜索</Button></div></template>
      <template #cell-preview="{ row }"><Button variant="ghost" size="sm" @click="preview = row">预览</Button></template>
      <template #cell-originalName="{ row }"><span class="block max-w-64 truncate">{{ row.originalName }}</span></template>
      <template #cell-fileSize="{ row }">{{ formatSize(row.fileSize) }}</template>
      <template #cell-uploadedAt="{ row }">{{ formatDate(row.uploadedAt) }}</template>
      <template #actions="{ row }"><Button variant="ghost" size="sm" @click="copy(row.url)">复制 URL</Button><Button variant="ghost" size="sm" @click="toDelete = row">删除</Button></template>
      <template #pagination><Pagination v-if="data.total > data.pageSize" :total="data.total" :page="data.page" :page-size="data.pageSize" @update:page="goPage" /></template>
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
    <Dialog :open="Boolean(preview)" @update:open="(open) => { if (!open) preview = null }">
      <DialogContent class="w-[calc(100%-2rem)] max-w-3xl">
        <DialogHeader><DialogTitle>{{ preview?.originalName }}</DialogTitle></DialogHeader>
        <img v-if="preview?.mimeType.startsWith('image/')" :src="preview.url" :alt="preview.originalName" class="max-h-[70vh] w-full object-contain" />
        <iframe v-else-if="preview" :src="preview.url" class="h-[70vh] w-full" title="媒体预览" />
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
import { computed, onMounted, reactive, ref } from "vue";
import { RefreshCwIcon } from "@lucide/vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { runTelefunc } from "@/lib/telefunc-client";
import type { MediaConfigInput } from "@/server/media/types";
import { onGetMedia, onGetMediaConfig, onSaveMediaConfig, onTestMediaStorage } from "@/server/media/admin.telefunc";

type Row = Awaited<ReturnType<typeof onGetMedia>>["items"][number];
const columns: AdminTableColumn<Row>[] = [{ key: "preview", label: "预览" }, { key: "originalName", label: "文件名" }, { key: "mimeType", label: "类型" }, { key: "fileSize", label: "大小" }, { key: "uploadedAt", label: "上传时间" }];
const data = reactive<Awaited<ReturnType<typeof onGetMedia>>>({ items: [], total: 0, page: 1, pageSize: 20 });
const config = reactive<Awaited<ReturnType<typeof onGetMediaConfig>>>({ configured: false, values: null, credentialStatus: { accessKeyConfigured: false, secretKeyConfigured: false }, updatedAt: null });
const loading = ref(false), configOpen = ref(false), uploading = ref(false), saving = ref(false), deleting = ref(false), progress = ref(0), selectedFile = ref<File | null>(null), keyword = ref(""), mimeType = ref("all"), preview = ref<Row | null>(null), toDelete = ref<Row | null>(null), dragging = ref(false), webpSupported = ref(false), webpEnabled = ref(false);
const canUpload = computed(() => config.configured && config.credentialStatus.accessKeyConfigured && config.credentialStatus.secretKeyConfigured);
const { handleSubmit, resetForm, values } = useForm({ validationSchema: toTypedSchema(z.object({ endpoint: z.string().url(), bucket: z.string().min(1), accessKeyId: z.string().optional(), secretAccessKey: z.string().optional(), region: z.string().min(1), pathPrefix: z.string().min(1), cacheControl: z.string().min(1), forcePathStyle: z.boolean() })), initialValues: { endpoint: "", bucket: "", accessKeyId: "", secretAccessKey: "", region: "auto", pathPrefix: "media", cacheControl: "public, max-age=31536000, s-maxage=31536000, immutable", forcePathStyle: false } });
async function loadAll() { loading.value = true; try { const [c, list] = await Promise.all([runTelefunc(() => onGetMediaConfig(), { notifyError: false }), runTelefunc(() => onGetMedia({ keyword: keyword.value || undefined, mimeType: mimeType.value === "all" ? undefined : mimeType.value as "image/" | "application/pdf", page: data.page, pageSize: data.pageSize }), { notifyError: false })]); Object.assign(config, c); Object.assign(data, list); if (c.values) resetForm({ values: { ...c.values, accessKeyId: "", secretAccessKey: "" } }); } catch { /* runTelefunc 已显示脱敏错误。 */ } finally { loading.value = false; } }
function search() { data.page = 1; void loadAll(); }
function goPage(page: number) { data.page = page; void loadAll(); }
function setFile(file: File | null) { selectedFile.value = file; }
function selectFile(event: Event) { setFile((event.target as HTMLInputElement).files?.[0] ?? null); }
function dropFile(event: DragEvent) { dragging.value = false; setFile(event.dataTransfer?.files[0] ?? null); }
async function optimizeFile(file: File) { if (!webpEnabled.value || !["image/jpeg", "image/png"].includes(file.type)) return file; try { const bitmap = await createImageBitmap(file); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close(); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.7)); if (!blob || blob.size >= file.size) return file; return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" }); } catch { toast.info("图片压缩失败，已上传原文件。"); return file; } }
async function upload() { if (!selectedFile.value || !canUpload.value) return; uploading.value = true; progress.value = 0; const file = await optimizeFile(selectedFile.value); const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/media/upload"); xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress.value = Math.round(event.loaded / event.total * 100); }; xhr.onload = async () => { uploading.value = false; if (xhr.status >= 200 && xhr.status < 300) { toast.success("文件上传成功。"); selectedFile.value = null; void loadAll(); } else { const response = new Response(xhr.responseText, { status: xhr.status, headers: { "content-type": xhr.getResponseHeader("content-type") ?? "text/plain" } }); toast.error(mediaApiUserError(await mediaApiError(response))); } }; xhr.onerror = () => { uploading.value = false; toast.error("接口异常，请稍后重试。"); }; const form = new FormData(); form.append("file", file); xhr.send(form); }
const saveConfig = handleSubmit(async (input) => { saving.value = true; try { await runTelefunc(() => onSaveMediaConfig(input), { successMessage: "媒体存储配置已保存。" }); configOpen.value = false; await loadAll(); } catch { /* runTelefunc 已显示脱敏错误。 */ } finally { saving.value = false; } });
async function testConfig() { try { await runTelefunc(() => onTestMediaStorage(values as MediaConfigInput), { successMessage: "存储连接测试成功。" }); } catch { /* runTelefunc 已显示脱敏错误。 */ } }
async function remove() { if (!toDelete.value) return; deleting.value = true; try { await deleteMedia(toDelete.value.id); toast.success("媒体文件已删除。"); toDelete.value = null; await loadAll(); } catch (cause) { toast.error(mediaApiUserError(cause)); } finally { deleting.value = false; } }
async function copy(url: string) { await navigator.clipboard.writeText(url); toast.success("URL 已复制。"); }
function formatSize(value: number) { return value < 1048576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1048576).toFixed(2)} MB`; }
function formatDate(value: Date | string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
onMounted(() => { const canvas = document.createElement("canvas"); webpSupported.value = canvas.toDataURL("image/webp").startsWith("data:image/webp"); webpEnabled.value = webpSupported.value; void loadAll(); });
</script>
