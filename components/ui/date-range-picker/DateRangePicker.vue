<script setup lang="ts">
import { computed, ref } from "vue";
import { CalendarIcon, XIcon } from "@lucide/vue";
import { DateFormatter, getLocalTimeZone, parseDate } from "@internationalized/date";
import type { DateRange } from "reka-ui";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RangeCalendar } from "@/components/ui/range-calendar";

export type DateRangeValue = { start: string; end: string };

const value = defineModel<DateRangeValue>({ required: true });
const open = ref(false);
const formatter = new DateFormatter("zh-CN", { dateStyle: "medium" });

const selectedRange = computed<DateRange | undefined>(() => {
  if (!value.value.start) return undefined;
  try {
    return {
      start: parseDate(value.value.start),
      end: value.value.end ? parseDate(value.value.end) : undefined,
    };
  } catch {
    return undefined;
  }
});

const label = computed(() => {
  if (!selectedRange.value?.start) return "选择日期范围";
  const start = formatter.format(selectedRange.value.start.toDate(getLocalTimeZone()));
  if (!selectedRange.value.end) return `${start} 起`;
  const end = formatter.format(selectedRange.value.end.toDate(getLocalTimeZone()));
  return `${start} 至 ${end}`;
});

function updateRange(range: DateRange | undefined) {
  value.value = {
    start: range?.start?.toString() ?? "",
    end: range?.end?.toString() ?? "",
  };
  if (range?.start && range.end) open.value = false;
}

function clearRange() {
  value.value = { start: "", end: "" };
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" size="sm" class="w-full justify-start text-left font-normal" :class="!selectedRange && 'text-muted-foreground'" aria-label="选择日期范围">
        <CalendarIcon />
        <span class="truncate">{{ label }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <RangeCalendar :model-value="selectedRange" :number-of-months="2" locale="zh-CN" @update:model-value="updateRange" />
      <div class="flex justify-end border-t p-2">
        <Button type="button" variant="ghost" size="sm" :disabled="!selectedRange" @click="clearRange"><XIcon />清除</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
