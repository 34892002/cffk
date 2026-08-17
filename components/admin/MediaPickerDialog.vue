<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden p-0">
      <DialogHeader class="border-b px-6 py-5 pr-8">
        <DialogTitle>选择媒体图片</DialogTitle>
        <DialogDescription>仅显示媒体库中的图片；也可以继续手工填写 URL。</DialogDescription>
      </DialogHeader>

      <div class="space-y-3 border-b px-6 py-4">
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Input v-model="keyword" placeholder="搜索媒体库图片..." @keyup.enter="search" />
          </div>
          <Button variant="outline" size="icon" :disabled="loading" title="搜索" @click="search">
            <LoaderIcon v-if="loading" class="h-4 w-4 animate-spin" />
            <SearchIcon v-else class="h-4 w-4" />
          </Button>
        </div>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Input v-model="externalUrl" placeholder="或粘贴外部图片链接..." @keyup.enter="selectExternalUrl" />
          </div>
          <Button variant="outline" size="icon" :disabled="!externalUrl.trim()" title="插入外部 URL" @click="selectExternalUrl">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1 2-2h6" /></svg>
          </Button>
        </div>
      </div>

      <ScrollArea ref="scrollAreaRef" class="min-h-100" @scroll="onScroll">
        <div v-if="items.length === 0" class="flex min-h-100 items-center justify-center px-6 py-5">
          <!-- 加载状态 -->
          <div v-if="loading" class="text-center">
            <div class="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon class="h-4 w-4 animate-spin" />
              加载中...
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="text-center text-sm text-muted-foreground">
            {{ keyword ? '未找到匹配的图片。' : '暂无图片媒体。' }}
          </div>
        </div>

        <!-- 图片网格 -->
        <div v-if="items.length > 0" class="px-6 py-5">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              class="group overflow-hidden rounded-md border text-left transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="select(item.url)"
            >
              <div class="relative aspect-square w-full overflow-hidden bg-muted">
                <img
                  :src="item.url"
                  :alt="item.originalName"
                  class="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div class="px-2 py-2">
                <span class="block truncate text-xs font-medium">{{ item.originalName }}</span>
                <span class="text-xs text-muted-foreground">{{ formatSize(item.fileSize) }}</span>
              </div>
            </button>
          </div>

          <!-- 加载更多指示器 -->
          <div v-if="hasMore" class="mt-4 text-center">
            <div v-if="loadingMore" class="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <LoaderIcon class="h-4 w-4 animate-spin" />
              加载中...
            </div>
            <div v-else ref="sentinelRef" class="h-4" />
          </div>
        </div>
      </ScrollArea>

      <div v-if="items.length > 0" class="border-t px-6 py-3 text-xs text-muted-foreground">
        已加载 {{ items.length }} / {{ total }} 张图片
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Loader as LoaderIcon, Search as SearchIcon } from "@lucide/vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
const loadingMore = ref(false);
const items = ref<Awaited<ReturnType<typeof onGetMedia>>["items"]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 24;
const scrollAreaRef = ref<InstanceType<typeof ScrollArea>>();
const sentinelRef = ref<HTMLElement>();
let observer: IntersectionObserver | null = null;

const hasMore = computed(() => items.value.length < total.value);

// 监听对话框打开
watch(() => props.open, (open) => {
  if (open) {
    keyword.value = "";
    externalUrl.value = "";
    page.value = 1;
    items.value = [];
    void loadMedia();
    setupIntersectionObserver();
  } else {
    cleanupObserver();
  }
});

// 设置 Intersection Observer 用于无限滚动
function setupIntersectionObserver() {
  cleanupObserver();
  
  nextTick(() => {
    if (!sentinelRef.value) return;
    
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore.value && !loadingMore.value) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0.1
      }
    );
    
    observer.observe(sentinelRef.value);
  });
}

// 清理 observer
function cleanupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// 监听哨兵元素变化，重新设置观察
watch(() => sentinelRef.value, (element) => {
  if (element && hasMore.value) {
    setupIntersectionObserver();
  }
});

async function loadMedia(append = false) {
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }

  try {
    const result = await runTelefunc(
      () => onGetMedia({
        keyword: keyword.value || undefined,
        mimeType: "image/",
        page: page.value,
        pageSize
      }),
      { notifyError: false }
    );

    if (append) {
      items.value = [...items.value, ...result.items];
    } else {
      items.value = result.items;
    }
    total.value = result.total;
  } catch {
    /* runTelefunc 已显示脱敏错误。 */
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function search() {
  page.value = 1;
  items.value = [];
  void loadMedia();
}

function loadMore() {
  page.value += 1;
  void loadMedia(true);
}

function onScroll() {
  // ScrollArea 的滚动已经通过 IntersectionObserver 处理
  // 这个函数保留用于其他可能的滚动逻辑
}

function select(url: string) {
  emit("select", url);
  emit("update:open", false);
}

function selectExternalUrl() {
  const url = externalUrl.value.trim();
  if (url) select(url);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
</script>
