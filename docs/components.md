# AdminDataTable

`AdminDataTable` 是后台管理列表的轻量通用基座，使用项目现有的 shadcn-vue 表格组件实现。它统一处理工具栏、表格边框、空状态、操作列和分页区域；请求、筛选、分页数据和表单仍由业务页面负责。

## 基本用法

```vue
<script setup lang="ts">
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue"

const columns: AdminTableColumn<Row>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "名称" },
  { key: "status", label: "状态" },
]
</script>

<AdminDataTable :columns="columns" :rows="rows" row-key="id">
  <template #toolbar>
    <!-- 搜索、筛选、刷新和新增按钮 -->
  </template>

  <template #cell-status="{ row }">
    <Badge>{{ row.status }}</Badge>
  </template>

  <template #actions="{ row }">
    <Button variant="ghost" size="sm" @click="edit(row)">编辑</Button>
  </template>

  <template #pagination>
    <Pagination ... />
  </template>
</AdminDataTable>
```

## Props

- `columns`: 列配置，包含 `key`、`label`，可选 `class`、`headerClass` 和 `value`。
- `rows`: 当前要展示的行数据，通常传入筛选和分页后的数组。
- `row-key`: 行唯一键，可以是字段名，也可以是返回字符串或数字的函数。
- `empty-text`: 无数据时的提示，默认为 `暂无数据。`。

## 插槽

- `toolbar`: 列表顶部工具栏。
- `cell-{key}`: 定制指定列的单元格，提供 `row` 和 `value`。
- `actions`: 每行右侧操作区，提供 `row`。
- `pagination`: 表格边框外的分页区域。

业务页面负责维护查询状态，并在查询条件变化时重置页码；组件不绑定接口或业务模型，因此可复用于商品、卡密、优惠码、订单等后台列表。
