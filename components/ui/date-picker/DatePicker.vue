<script setup lang="ts">
import { computed } from "vue";
import { CalendarIcon, XIcon } from "@lucide/vue";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import type { DateValue } from "reka-ui";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const value = defineModel<string>({ default: "" });

withDefaults(defineProps<{
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}>(), {
  placeholder: "选择日期",
  ariaLabel: "选择日期",
  disabled: false,
});

const open = defineModel<boolean>("open", { default: false });
const formatter = new DateFormatter("zh-CN", { dateStyle: "medium" });
const selectedDate = computed<DateValue | undefined>(() => {
  if (!value.value) return undefined;
  try {
    return parseDate(value.value);
  } catch {
    return undefined;
  }
});

function updateDate(date: DateValue | undefined) {
  value.value = date ? date.toString() : "";
  open.value = false;
}

function clearDate() {
  value.value = "";
}

function defaultPlaceholder() {
  return selectedDate.value ?? today(getLocalTimeZone());
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :disabled="disabled"
        :aria-label="ariaLabel"
        class="w-full justify-start text-left font-normal"
        :class="!selectedDate && 'text-muted-foreground'"
      >
        <CalendarIcon />
        {{ selectedDate ? formatter.format(selectedDate.toDate(getLocalTimeZone())) : placeholder }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <Calendar
        :model-value="selectedDate"
        :default-placeholder="defaultPlaceholder()"
        locale="zh-CN"
        @update:model-value="updateDate"
      />
      <div class="flex justify-end border-t p-2">
        <Button type="button" variant="ghost" size="sm" :disabled="!value" @click="clearDate">
          <XIcon />清除
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
