# Vike-CF 开发规范

本规范适用于 `vike-cf` 的业务页面、Telefunc 接口和后台管理功能。目标是让页面交互、数据列表和错误反馈保持一致，避免在业务页面重复造 UI 或把临时反馈渲染成常驻内容。

## 1. UI 组件原则

### 1.1 优先使用项目已有组件

业务页面必须优先复用 `components/ui` 与 `components/admin` 中的组件：

- 输入：`Input`、`Textarea`、`Select`、`Checkbox`
- 日期：`DatePicker`（`Popover` + `Calendar` 封装）
- 按钮：`Button`
- 展示：`Card`、`Badge`
- 对话框：`reka-ui` 的 `DialogRoot` 家族
- 后台列表：`AdminDataTable`
- 分页：`Pagination`

禁止在业务页面直接新增原生 `<input>`、`<select>`、`<textarea>`、`<button>` 来绕开统一样式与交互。原生标签只应作为 UI 基础组件的内部实现。

如发现当前组件库缺少需要的能力，先确认 shadcn-vue 是否有官方组件；通过 CLI 添加并按项目风格封装，而不是在单个页面手写一套无法复用的控件。

### 1.2 临时反馈使用 Sonner Toast

成功、失败、校验提醒等**短暂反馈**必须使用 `vue-sonner`：

```ts
import { toast } from "vue-sonner";

toast.success("卡密已导入。");
toast.error("请先选择商品。");
toast.info("数据已刷新。");
```

全局 `Toaster` 由 `pages/+Layout.vue` 统一挂载，并必须同时导入官方样式：

```vue
<script setup lang="ts">
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
</script>

<template>
  <slot />
  <Toaster rich-colors position="top-right" :offset="16" />
</template>
```

不要在业务页面为一次操作失败渲染顶部或底部常驻 `Alert`。它会挤占页面布局、在切换操作后残留，并且在未正确挂载样式时容易被误当成普通文档流内容。

`Alert` 仅用于需要持续展示、且用户必须阅读的页面级状态，例如服务维护公告、无法继续工作的初始化失败状态，或不可忽略的配置告警。

### 1.3 破坏性操作

删除、清空、关闭等不可恢复的操作必须：

1. 使用 `DialogRoot` 确认，不依赖浏览器 `confirm()`。
2. 明确说明影响范围与不可恢复性。
3. 提交期间禁用确认按钮，避免重复请求。
4. 服务端再次校验目标状态/权限，不能只依赖前端禁用。
5. 成功或失败后使用 Toast 反馈结果。

```ts
function requestDelete(row: Row) {
  rowToDelete.value = row;
  deleteDialogOpen.value = true;
}

async function deleteRow() {
  if (!rowToDelete.value) return;
  saving.value = true;
  try {
    await onDeleteRow({ id: rowToDelete.value.id });
    deleteDialogOpen.value = false;
    toast.success("记录已删除。");
    await loadData();
  } catch (cause) {
    toast.error(messageFor(cause));
  } finally {
    saving.value = false;
  }
}
```

## 2. 后台列表规范

### 2.1 必须使用 `AdminDataTable`

所有后台管理中的实体列表（商品、订单、卡密、优惠码、管理员等）必须使用：

```vue
<AdminDataTable :columns="columns" :rows="data.items" row-key="id">
  <template #toolbar><!-- 筛选、刷新、新增操作 --></template>
  <template #cell-status="{ row }"><Badge>{{ row.status }}</Badge></template>
  <template #actions="{ row }"><!-- 行操作 --></template>
  <template #pagination><!-- Pagination --></template>
</AdminDataTable>
```

详细 API 见 [`components/AdminDataTable.md`](./components/AdminDataTable.md)。

### 2.2 一项业务字段对应一列

`columns` 必须让每一个业务字段对应单独的列。例如卡密列表应拆成：`商品`、`卡密预览`、`批次`、`状态`、`订单`、`创建时间`，不能把多项信息堆叠在一个 `#cell-*` 单元格中。

```ts
const columns: AdminTableColumn<CardRow>[] = [
  { key: "id", label: "ID" },
  { key: "productName", label: "商品" },
  { key: "contentPreview", label: "卡密预览" },
  { key: "batchNo", label: "批次" },
  { key: "status", label: "状态" },
  { key: "orderId", label: "订单" },
  { key: "createdAt", label: "创建时间" },
];
```

仅当字段需要格式化时使用 `#cell-{key}` 插槽，例如状态 Badge、金额、日期或截断文本。不要为了布局把其它字段塞入该插槽。

### 2.3 工具栏与筛选布局

- 工具栏放在 `#toolbar`。
- 筛选条件与页面操作分组展示；筛选项按内容语义设置最小宽度和伸缩规则，不要所有控件机械使用同一固定宽度。
- 商品名称通常比状态更长；日期控件必须留出完整中文日期的宽度；按钮按内容宽度，不参与拉伸。
- 使用 `flex flex-wrap` 配合合理的 `min-w-*`/`flex-*` 实现响应式布局。宽度不足时允许换行，不要压缩到文字溢出。
- 搜索、重置应显式触发请求；筛选选择框不应通过关闭菜单等隐式事件请求数据。
- 更改任意查询条件或每页条数时，将页码重置为第 1 页。

### 2.4 敏感字段的列表投影

列表接口只能返回页面所需字段。密钥、卡密全文、令牌、密码、支付敏感信息等不得直接返回给列表 UI。

服务端应生成显示安全的字段，例如：

```ts
function previewCard(content: string) {
  return content.length <= 8
    ? content
    : `${content.slice(0, 4)}****${content.slice(-4)}`;
}

return {
  items: rows.map(({ content, ...row }) => ({
    ...row,
    contentPreview: previewCard(content),
  })),
};
```

不要把原始 `content` 发给前端后再隐藏；浏览器网络响应和开发工具仍可读取它。

## 3. 列表 Telefunc 接口契约

### 3.1 查询参数

列表查询函数使用一个对象参数，所有筛选条件可选，分页参数统一命名：

```ts
type EntityListQuery = {
  keyword?: string;
  status?: EntityStatus;
  productId?: number;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD，服务端按结束日次日零点排他处理
  page?: number;
  pageSize?: number;
};

export async function onGetEntityAdminData(input: EntityListQuery = {}) {
  // ...
}
```

服务端必须校正而不是相信客户端分页值：

```ts
const page = Math.max(1, Math.floor(input.page ?? 1));
const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 20)));
```

日期、枚举、数字 ID 和字符串长度必须在服务端验证。日期推荐在接口边界转换为精确的起始时间和结束日的**排他**边界，避免当天晚些时候的数据被遗漏。

### 3.2 返回结构

管理列表应返回能直接驱动 `AdminDataTable` 和 `Pagination` 的对象：

```ts
type EntityListResult = {
  items: EntityRow[];
  total: number;
  page: number;
  pageSize: number;
  // 页面筛选所需的辅助数据可附在此处。
  products: Array<{ id: number; name: string }>;
  overview?: {
    total: number;
    available: number;
    sold: number;
  };
};
```

约束：

- `items` 仅包含当前页行数据。
- `total` 是**当前筛选条件**下的总数，供 `Pagination` 计算页数。
- `page`、`pageSize` 返回服务端最终采用的值，避免前后端状态漂移。
- 全局概览（如总库存）必须明确是否不受筛选条件影响；默认应作为全局统计单独查询，不能误用当前页或当前筛选的 `total`。
- 关联显示字段（如 `productName`）在服务端 join/投影完成，避免前端用多次请求拼接。

页面侧保持查询状态，由页面负责请求：

```ts
const data = reactive<EntityListResult>({
  items: [], total: 0, page: 1, pageSize: 20, products: [],
});
const page = ref(1);
const pageSize = ref(20);

async function loadData() {
  try {
    const result = await onGetEntityAdminData({
      ...filters,
      page: page.value,
      pageSize: pageSize.value,
    });
    Object.assign(data, result);
  } catch (cause) {
    toast.error(messageFor(cause));
  }
}
```

## 4. Telefunc 错误设计与统一处理

### 4.1 调用边界：Telefunc 与 HTTP API 分开规范

项目同时使用 Telefunc RPC 和少量 Hono HTTP 接口；两者不能混用响应约定。

- **页面到项目服务端的业务调用：使用 Telefunc。** 成功时直接返回业务数据；预期业务失败时抛出 `AppError`/稳定错误码。不要为 Telefunc 添加 `{ code, message, data }` 包装层。
- **公开或第三方 HTTP API：使用 HTTP 状态码与 JSON 信封** `{ code, message, data }`。`code: 0` 代表成功；`400/401/403/404/409` 携带稳定业务码；未预期异常返回 `500` 和 `INTERNAL_ERROR`。
- **协议回调例外：** 支付回调等由第三方协议规定响应格式的路由，保留协议要求的纯文本/签名响应，不能强制套 JSON 信封。

### 4.2 Telefunc 服务端：稳定错误码，不泄露内部信息

Telefunc 应在权限、输入校验、状态机校验失败时抛出稳定、全大写的业务错误码：

```ts
if (!context.user || !context.isAdmin) {
  throw new Error("ADMIN_ACCESS_REQUIRED");
}
if (!Number.isInteger(input.id) || input.id < 1) {
  throw new Error("ENTITY_ID_INVALID");
}
if (!record) {
  throw new Error("ENTITY_NOT_FOUND");
}
if (record.status !== "DRAFT") {
  throw new Error("ENTITY_DELETE_REJECTED");
}
```

规则：

- 错误码使用 `UPPER_SNAKE_CASE`，按资源和语义命名，例如 `CARD_CONTENT_REQUIRED`、`PRODUCT_NOT_CARD_AUTO`、`CARD_DELETE_REJECTED`。
- 不将数据库异常、SQL、堆栈、第三方支付原始响应或敏感值直接传给客户端。
- 对“删除/状态切换”等并发敏感操作，将可操作状态写进 `where` 条件；根据 `returning()` 是否返回记录判断结果。
- 未预期异常保留服务端日志，客户端统一显示通用错误文案。

### 4.3 前端：必须通过 `runTelefunc()` 统一处理

所有会向用户反馈结果的 Telefunc 调用必须经由 `@/lib/telefunc-client` 的 `runTelefunc()`，不得在页面中直接调用后自行 `toast.error()` 或复制 `messageFor()`：

```ts
import { runTelefunc } from "@/lib/telefunc-client";

await runTelefunc(
  () => onDeleteCard({ id }),
  { successMessage: "卡密已删除。" },
);
```

`runTelefunc()` 统一处理：

- 成功时按需显示 `successMessage`；
- 已知业务错误码从 `lib/error-messages.ts` 映射为中文 Toast；
- 未知业务错误、网络传输失败、Telefunc 服务端 `500` 等显示统一文案：`接口异常，请稍后重试。`；
- 显示 Toast 后重新抛出异常，以便页面在 `finally` 里恢复 loading/saving 状态。

调用方只保留空的 `catch`（防止未处理 Promise）或仅处理页面状态；不要再次显示错误 Toast：

```ts
try {
  await runTelefunc(() => onSaveEntity(input), { successMessage: "保存成功。" });
  await loadData();
} catch {
  // runTelefunc 已显示统一错误提示。
} finally {
  saving.value = false;
}
```

`lib/error-messages.ts` 是业务错误码与用户中文文案的唯一映射源。新增 Telefunc 错误码时，必须同步添加该映射；不允许新增页面私有 `messageFor()`。

只有确实需要表单附近持续错误信息的场景（例如结算表单字段校验）可以使用 `runTelefunc(..., { notifyError: false })`，再将 `userErrorMessage(cause)` 写入本地表单状态；不能同时显示 Alert 和 Toast。

### 4.4 HTTP API 客户端与 500 错误

Hono HTTP 接口在 `server/hono.ts` 统一处理未捕获异常：

```ts
{ code: "INTERNAL_ERROR", message: "接口异常，请稍后重试。", data: null }
```

并以 HTTP `500` 返回。新增 REST 客户端时，必须提供统一 `apiClient`：

```ts
const response = await fetch(url, options);
const body = await response.json();
if (!response.ok || body.code !== 0) {
  toast.error(errorMessages[body.code] ?? "接口异常，请稍后重试。");
  throw new Error(body.code ?? "INTERNAL_ERROR");
}
return body.data;
```

不要：

- 将 `Error.message`、数据库异常或第三方原始响应直接展示给用户。
- 把一次性操作错误写到页面常驻状态后不清除。
- 在 `catch` 中吞掉错误且没有任何用户反馈。
- 同时显示 Alert 与 Toast。
- 只在前端做“禁用按钮”等权限或状态校验。

## 5. 新功能完成前检查

提交前至少完成：

1. 对修改的 `.vue` / `.ts` 文件运行 diagnostics。
2. 运行 `npm run lint`；不能新增 warning 或 error。
3. 运行 `npm run build`。
4. 手动验证至少一个成功路径、一个输入错误路径和一个破坏性操作确认路径。
5. 检查列表响应未泄露敏感字段，并确认筛选、分页、空状态和 Toast 行为符合本规范。
