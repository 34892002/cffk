# Vike-CF 共用组件规范

业务页面优先复用 `components/ui`、`components/admin` 和本页已有组件。基础 UI 组件由 shadcn-vue 风格封装提供；业务页面不得直接用原生 `input`、`select`、`textarea`、`button` 绕开统一样式。

组件只负责展示与交互，不负责领域鉴权或直接发起业务 Telefunc。页面负责数据、请求与状态，服务端入口负责 `guest` / `user` / `root` 权限判断。完整权限与错误脱敏规则见 [框架设计规划.md](./框架设计规划.md)。

## 后台组件

### `AdminDataTable`

导入：

```ts
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";
```

后台**实体管理列表**的通用基座，统一工具栏、表格边框、空状态、操作列和分页区域。请求、筛选、分页状态和表单仍由页面负责。仪表盘摘要表不是实体管理列表，可直接使用基础 `Table`。

```vue
<script setup lang="ts">
import AdminDataTable, { type AdminTableColumn } from "@/components/admin/AdminDataTable.vue";

const columns: AdminTableColumn<Row>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "名称" },
  { key: "status", label: "状态" },
];
</script>

<template>
  <AdminDataTable :columns="columns" :rows="rows" row-key="id">
    <template #toolbar>
      <!-- 搜索、筛选、刷新和新增操作 -->
    </template>
    <template #cell-status="{ row }">
      <Badge>{{ row.status }}</Badge>
    </template>
    <template #actions="{ row }">
      <Button variant="ghost" size="sm" @click="edit(row)">编辑</Button>
    </template>
    <template #pagination>
      <Pagination />
    </template>
  </AdminDataTable>
</template>
```

#### Props

| Prop | 说明 |
| --- | --- |
| `columns` | 列配置：`key`、`label`，可选 `class`、`headerClass`、`value(row)` |
| `rows` | 当前展示行，通常为服务端筛选和分页后的结果 |
| `row-key` | 行唯一键：字段名，或返回字符串/数字的函数 |
| `show-actions` | 是否显示操作列，默认 `true`；没有行操作时必须传 `:show-actions="false"` |
| `empty-text` | 空状态提示，默认 `暂无数据.` |

#### 插槽

| 插槽 | 说明 |
| --- | --- |
| `toolbar` | 列表顶部的筛选、刷新和新增操作 |
| `cell-{key}` | 自定义指定列，参数为 `row`、`value` |
| `actions` | 行操作区，参数为 `row` |
| `pagination` | 表格下方分页区 |

一项业务字段对应一列；状态、金额、日期、截断文本等格式化才使用 `cell-{key}`，不要将多个不相关字段堆进一个单元格。列表接口只返回展示所需字段，卡密全文、密码、token、密钥等不要发送到前端。

### `Switch`

导入：

```ts
import { Switch } from "@/components/ui/switch";
```

用于立即生效或保存后生效的单个布尔配置，例如启用推送渠道、订单通知事件。二元开关不得使用 `Checkbox`；`Checkbox` 只用于多选或确认项。

```vue
<label class="flex items-center justify-between gap-3">
  <span>启用消息推送</span>
  <Switch v-model="form.isEnabled" />
</label>
```

组件基于 Reka `SwitchRoot`，支持键盘操作与 `v-model`。必须有可点击的关联文字；使用 `label` 包裹，或通过 `id` / `for` 明确关联，避免只展示无上下文的开关。

### `AdminPageHeader`

导入：

```ts
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
```

普通后台页的统一页头。从 `lib/admin-navigation.ts` 根据当前路由读取 `pageTitle` 和 `description`，因此页面不得重复硬编码标题或描述。

```vue
<AdminPageHeader>
  <template #actions>
    <Button>新增</Button>
  </template>
</AdminPageHeader>
```

- `actions`：页头右侧操作区。
- 仅在 `pages/@adminPath/**` 后台页面内使用。

### `MailSettingsLayout`

导入：

```ts
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
```

邮件二级模块的布局，提供从 `adminNavigation` 派生的邮件模块标题、描述和三级导航。内容通过默认插槽传入。

```vue
<MailSettingsLayout>
  <!-- 通道配置、模板或统计内容 -->
</MailSettingsLayout>
```

组件已为当前三级页设置 `aria-current="page"`。邮件子页不得自行复制导航、标题或路径。

## 跨页面组件

### `AdminSidebar`

导入：

```ts
import AdminSidebar from "@/components/AdminSidebar.vue";
```

后台 Layout 使用的侧栏，链接路径和名称来自 `lib/admin-navigation.ts`，并使用当前路由参数拼接 `ADMIN_PATH`。它负责菜单展示、展开状态和退出登录；不负责权限判断，后台 guard 与管理 Telefunc 才是 root 访问边界。

仅由 `pages/@adminPath/+Layout.vue` 挂载，不在业务页面重复创建侧栏。

### `PaymentQrCode`

导入：

```ts
import PaymentQrCode from "@/components/PaymentQrCode.vue";
```

根据支付 URL 渲染支付宝付款二维码。

```vue
<PaymentQrCode :value="paymentUrl" />
```

| Prop | 说明 |
| --- | --- |
| `value` | 二维码承载的支付 URL；为空时不渲染内容 |

组件使用 canvas 并提供 `role="img"` 和“支付宝付款二维码”标签。调用方只传后端返回的支付 URL，不记录或展示支付签名、密钥等敏感配置。

## 新增组件规则

1. 只供一个页面使用的小组件放在对应页面目录；跨两个及以上模块复用时才提升到 `components/admin` 或 `components`。
2. 新共享组件必须补充本文件：用途、导入路径、Props、插槽、简短示例及必要的可访问性说明。
3. 缺少基础能力时，先检查 shadcn-vue；不要在单页复制一套不可复用控件。
4. 临时成功或失败反馈使用 Sonner Toast；不可恢复操作使用 `DialogRoot` 确认。错误内容必须来自统一脱敏映射，不显示原始 `Error.message`。
