<script setup lang="ts">
import { computed } from "vue"
import { ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const props = withDefaults(defineProps<{
  total: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
}>(), {
  pageSizeOptions: () => [10, 20, 50],
})

const emit = defineEmits<{
  (event: "update:page", value: number): void
  (event: "update:pageSize", value: number): void
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const currentPage = computed(() => Math.min(Math.max(props.page, 1), totalPages.value))


function setPage(page: number) {
  emit("update:page", Math.min(Math.max(page, 1), totalPages.value))
}

function setPageSize(value: unknown) {
  const pageSize = Number(value)
  if (Number.isFinite(pageSize) && pageSize > 0) emit("update:pageSize", pageSize)
}
</script>

<template>
  <div class="flex w-full flex-wrap items-center justify-between gap-4">
    <span class="text-sm text-muted-foreground">共 {{ total }} 条记录</span>
    <div class="flex flex-wrap items-center gap-6">
      <label class="flex items-center gap-2 text-sm font-medium">
        <span>每页条数</span>
        <Select :model-value="String(pageSize)" @update:model-value="setPageSize">
          <SelectTrigger class="h-8 min-w-16"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem v-for="option in pageSizeOptions" :key="option" :value="String(option)">{{ option }}</SelectItem></SelectContent>
        </Select>
      </label>
      <span class="text-sm font-medium">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" :disabled="currentPage <= 1" aria-label="首页" @click="setPage(1)"><ChevronsLeftIcon /></Button>
        <Button variant="outline" size="icon-sm" :disabled="currentPage <= 1" aria-label="上一页" @click="setPage(currentPage - 1)"><ChevronLeftIcon /></Button>
        <Button variant="outline" size="icon-sm" :disabled="currentPage >= totalPages" aria-label="下一页" @click="setPage(currentPage + 1)"><ChevronRightIcon /></Button>
        <Button variant="outline" size="icon-sm" :disabled="currentPage >= totalPages" aria-label="末页" @click="setPage(totalPages)"><ChevronsRightIcon /></Button>
      </div>
    </div>
  </div>
</template>
