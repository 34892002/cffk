<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden p-0">
      <DialogHeader class="border-b px-6 py-5 pr-8">
        <DialogTitle>选择媒体图片</DialogTitle>
        <DialogDescription>仅显示媒体库中的图片；也可以继续手工填写 URL。</DialogDescription>
      </DialogHeader>
      <div class="grid gap-3 border-b px-6 py-4">
        <div class="flex gap-2">
          <Input v-model="keyword" placeholder="搜索文件名" @keyup.enter="loadMedia" />
          <Button variant="outline" :disabled="loading" @click="loadMedia">搜索</Button>
        </div>
        <div class="flex gap-2">
          <Input v-model="externalUrl" placeholder="https://example.com/image.jpg" aria-label="外部图片地址" @keyup.enter="selectExternalUrl" />
          <Button :disabled="!externalUrl.trim()" @click="selectExternalUrl">插入</Button>
        </div>
      </div>
      <div class="min-h-0 overflow-y-auto px-6 py-5">
        <div v-if="!items.length && !loading" class="py-10 text-center text-sm text-muted-foreground">暂无图片媒体。</div>
        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <button v-for="item in items" :key="item.id" type="button" class="overflow-hidden rounded-md border text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="select(item.url)">
            <img :src="item.url" :alt="item.originalName" class="aspect-square w-full object-cover" loading="lazy" />
            <span class="block truncate px-2 py-2 text-xs">{{ item.originalName }}</span>
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runTelefunc } from "@/lib/telefunc-client";
import { onGetMedia } from "@/server/media/admin.telefunc";

type Props = { open: boolean };
const props = defineProps<Props>();
const emit = defineEmits<{ "update:open": [value: boolean]; select: [url: string] }>();
const keyword = ref("");
const externalUrl = ref("");
const loading = ref(false);
const items = ref<Awaited<ReturnType<typeof onGetMedia>>["items"]>([]);

watch(() => props.open, (open) => { if (open) void loadMedia(); });
async function loadMedia() {
  loading.value = true;
  try {
    const result = await runTelefunc(() => onGetMedia({ keyword: keyword.value || undefined, mimeType: "image/", page: 1, pageSize: 100 }), { notifyError: false });
    items.value = result.items;
  } catch { /* runTelefunc 已显示脱敏错误。 */ } finally { loading.value = false; }
}
function select(url: string) { emit("select", url); emit("update:open", false); }
function selectExternalUrl() { const url = externalUrl.value.trim(); if (url) select(url); }
</script>
