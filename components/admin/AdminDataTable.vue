<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed } from "vue"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type AdminTableColumn<TRow extends Record<string, unknown> = Record<string, unknown>> = {
  key: string
  label: string
  class?: string
  headerClass?: string
  value?: (row: TRow) => unknown
}

const props = withDefaults(defineProps<{
  columns: AdminTableColumn<TRow>[]
  rows: TRow[]
  rowKey: keyof TRow | ((row: TRow) => string | number)
  showActions?: boolean
  emptyText?: string
}>(), {
  showActions: true,
  emptyText: "暂无数据.",
})

const columnCount = computed(() => props.columns.length + (props.showActions ? 1 : 0))

function keyFor(row: TRow) {
  return typeof props.rowKey === "function" ? props.rowKey(row) : String(row[props.rowKey])
}

function valueFor(row: TRow, column: AdminTableColumn<TRow>) {
  return column.value ? column.value(row) : row[column.key]
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="$slots.toolbar" class="flex items-center justify-between gap-3">
      <slot name="toolbar" />
    </div>

    <div class="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              v-for="column in columns"
              :key="column.key"
              :class="column.headerClass"
            >
              {{ column.label }}
            </TableHead>
            <TableHead v-if="showActions" class="w-px text-right">
              <span class="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in rows" :key="keyFor(row)">
            <TableCell v-for="column in columns" :key="column.key" :class="column.class">
              <slot :name="`cell-${column.key}`" :row="row" :value="valueFor(row, column)">
                {{ valueFor(row, column) }}
              </slot>
            </TableCell>
            <TableCell v-if="showActions" class="whitespace-nowrap text-right">
              <slot name="actions" :row="row" />
            </TableCell>
          </TableRow>
          <TableRow v-if="!rows.length">
            <TableCell :colspan="columnCount" class="h-28 text-center text-muted-foreground">
              {{ emptyText }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <div v-if="$slots.pagination" class="px-2 py-1">
      <slot name="pagination" />
    </div>
  </div>
</template>
