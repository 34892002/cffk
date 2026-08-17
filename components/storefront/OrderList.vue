<template>
  <ScrollArea class="h-full min-h-0">
    <div class="p-4">
      <section v-for="(group, groupIndex) in groups" :key="group.key">
        <div v-if="group.title" class="flex items-center justify-between gap-3 py-2">
          <h2 class="truncate text-sm font-medium" :title="group.title">{{ group.title }}</h2>
          <div class="flex items-center gap-1">
            <Badge variant="outline">{{ group.orders.length }}</Badge>
            <Button v-if="onDeleteGroup" type="button" variant="ghost" size="icon-sm" :aria-label="`删除 ${group.title} 的订单`" @click="onDeleteGroup(group.key)">
              <Trash2Icon />
            </Button>
          </div>
        </div>
        <template v-for="(item, itemIndex) in group.orders" :key="item.orderNo">
          <button
            type="button"
            class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-2 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="onSelect(item, group.key)"
          >
            <span class="min-w-0">
              <span class="flex min-w-0 items-center gap-2">
                <span class="block truncate text-sm font-medium">{{ item.productName }}</span>
                <Badge v-if="item.status" class="shrink-0" :variant="statusVariant?.(item.status)">{{ statusLabel?.(item.status) }}</Badge>
              </span>
              <span class="mt-1 block break-all font-mono text-[11px] leading-4 text-muted-foreground">{{ item.orderNo }}</span>
            </span>
            <span class="text-right text-xs text-muted-foreground">¥{{ item.amount }}<br>{{ formatDate(item.createdAt) }}</span>
          </button>
          <Separator v-if="itemIndex < group.orders.length - 1" />
        </template>
        <Separator v-if="groupIndex < groups.length - 1" class="my-3" />
      </section>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Trash2Icon } from "@lucide/vue";

export type OrderListItem = {
  orderNo: string;
  productName: string;
  amount: string;
  createdAt: string | Date;
  status?: string;
};

export type OrderListGroup = {
  key: string;
  title?: string;
  orders: OrderListItem[];
};

defineProps<{
  groups: OrderListGroup[];
  onSelect: (item: OrderListItem, groupKey: string) => void;
  onDeleteGroup?: (groupKey: string) => void;
  statusLabel?: (status: string) => string;
  statusVariant?: (status: string) => "default" | "secondary" | "destructive" | "outline";
}>();

function formatDate(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN");
}
</script>
