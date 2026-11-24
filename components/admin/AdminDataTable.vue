<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed } from "vue"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

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
  selectable?: boolean
  selectedKeys?: string[]
  rowSelectable?: (row: TRow) => boolean
}>(), {
  showActions: true,
  emptyText: "暂无数据.",
  selectable: false,
  selectedKeys: () => [],
})

const emit = defineEmits<{ "update:selectedKeys": [keys: string[]] }>()

const columnCount = computed(() => props.columns.length + (props.showActions ? 1 : 0) + (props.selectable ? 1 : 0))

function keyFor(row: TRow) {
  return typeof props.rowKey === "function" ? props.rowKey(row) : String(row[props.rowKey])
}

function valueFor(row: TRow, column: AdminTableColumn<TRow>) {
  return column.value ? column.value(row) : row[column.key]
}

const selectedSet = computed(() => new Set(props.selectedKeys))
const selectableRows = computed(() => props.rows.filter((row) => props.rowSelectable?.(row) ?? true))
const selectedOnPage = computed(() => selectableRows.value.filter((row) => selectedSet.value.has(keyFor(row))))
const allSelected = computed(() => selectableRows.value.length > 0 && selectedOnPage.value.length === selectableRows.value.length)
const someSelected = computed(() => selectedOnPage.value.length > 0 && !allSelected.value)
const headerCheckboxState = computed(() => (allSelected.value ? true : someSelected.value ? "indeterminate" as const : false))

function isSelected(row: TRow) {
  return selectedSet.value.has(keyFor(row))
}

function toggleRow(row: TRow, value: boolean | "indeterminate") {
  const next = new Set(selectedSet.value)
  const key = keyFor(row)
  if (value === true) next.add(key)
  else next.delete(key)
  emit("update:selectedKeys", [...next])
}

function toggleAll(value: boolean | "indeterminate") {
  const next = new Set(selectedSet.value)
  for (const row of selectableRows.value) {
    const key = keyFor(row)
    if (value === true) next.add(key)
    else next.delete(key)
  }
  emit("update:selectedKeys", [...next])
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
            <TableHead v-if="selectable" class="w-px">
              <Checkbox
                :model-value="headerCheckboxState"
                :disabled="!selectableRows.length"
                aria-label="选择本页全部可操作项"
                @update:model-value="toggleAll"
              />
            </TableHead>
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
            <TableCell v-if="selectable" class="w-px">
              <Checkbox
                :model-value="isSelected(row)"
                :disabled="!(rowSelectable?.(row) ?? true)"
                aria-label="选择该行"
                @update:model-value="(value) => toggleRow(row, value)"
              />
            </TableCell>
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
