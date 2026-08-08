# 项目背景
本项目cffk是一个基于vike全栈开发的发卡站项目， 计划从 edgeKey 发卡站项目(文档 edgeKey\docs，源码 edgeKey\)移植改造， 因为目前还是开发中未上线的全新项目，所以不要写什么兼容，迁移的冗余代码。开发前请`阅读 vike-cf\docs 了解项目背景和编码规则`

# Vike-CF 开发规范

本规范适用于 `vike-cf` 的业务页面、Telefunc 接口和后台管理功能。目标是让页面交互、数据列表和错误反馈保持一致，避免在业务页面重复造 UI 或把临时反馈渲染成常驻内容。

错误信息按 [框架设计规划.md](./框架设计规划.md) 的三层规则处理：前端必须脱敏；数据库业务日志仅移除 `sign` 与密钥；未预期异常的完整接口信息和原始错误输出到 Cloudflare Workers Observability，供 root 在 Cloudflare 控制台排查。

权限模型以 [框架设计规划.md](./框架设计规划.md) 为准：仅有 `guest`、`user`、`root` 三种身份，且项目只保留一个 `root`。不新增多角色、权限点、审批或审计系统。

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

### 1.3 后台表单

后台新增或重构的非平凡表单（包含多个字段、保存请求或业务校验）必须采用 `VeeValidate + Zod + shadcn-vue Field`：

- 通过 `vee-validate` 的 `useForm()` 管理表单状态，使用 `Field as VeeField` 为每个字段建立绑定；`Input`、`Textarea`、`Select` 等组件使用 `v-bind="componentField"`。
- 使用 `zod` 定义客户端 schema，并通过 `@vee-validate/zod` 的 `toTypedSchema()` 接入。客户端校验用于即时反馈，不可替代 Telefunc 服务端校验。
- 字段外层使用 `Field`、`FieldLabel`、`FieldDescription` 和 `FieldError`；字段组使用 `FieldGroup`，语义分组使用 `FieldSet`、`FieldLegend` 和 `FieldSeparator`。不得在业务页面用手写 `<label>` 加 class 替代该结构。
- 发生校验错误时，`Field` 必须设置 `:data-invalid="errors.length > 0"`，对应控件必须设置 `:aria-invalid="errors.length > 0"`，并通过 `FieldError` 紧邻展示错误。
- 表单使用 `novalidate`，由 Zod/VeeValidate 统一呈现客户端错误；仍可保留合适的输入属性，例如 `type="url"`、`autocomplete` 和 `inputmode`，以改善输入体验。
- 表单初始加载或重新加载数据时使用 `resetForm({ values })`，避免直接修改组件局部状态导致 VeeValidate 值不同步。
- 保存成功和服务端拒绝等短暂反馈使用 `runTelefunc()` 与 Sonner Toast；仅无法继续操作的加载失败可使用页面级 `Alert`。提交期间必须禁用提交按钮。
- `Select`、`Checkbox`、`Switch` 等非文本控件须按 shadcn-vue 文档绑定。特别是 `Select` 要将 `componentField` 绑定到 `Select` 根组件，而不是 `SelectTrigger`。

服务端仍必须对所有输入进行完整权限、格式、长度和业务状态校验；客户端 schema 仅是提升体验的第一道校验。

### 1.4 新增与编辑交互

实体的新增和编辑表单使用 `DialogRoot` 弹窗承载，不在列表下方插入长表单。新增和编辑共用同一个弹窗及表单状态：点击行操作后加载目标数据，保存成功后关闭并刷新列表；取消仅关闭弹窗，不提交修改。

- 弹窗内容超出视口时，内容区必须 `overflow-y-auto`，保存操作固定在底部，避免长配置表单需要滚动到页面末尾才能提交。
- 表单有未保存输入时，禁止通过点击遮罩或 `Escape` 意外关闭；提供明确的“关闭”或“取消”操作。
- 不可恢复的删除操作仍单独使用确认 Dialog，不与新增/编辑表单共用。

```vue
<VeeField v-slot="{ componentField, errors }" name="siteName" :validate-on-input="true">
  <Field :data-invalid="errors.length > 0">
    <FieldLabel for="site-name">站点名称</FieldLabel>
    <Input id="site-name" v-bind="componentField" :aria-invalid="errors.length > 0" />
    <FieldError v-if="errors.length" :errors="errors" />
  </Field>
</VeeField>
```

### 1.5 公开商城首页

首页（`pages/index/+Page.vue`）遵循以下固定结构与视觉规则：

- 顶部固定导航：展示 Logo 与站点名称；首页不显示“首页”按钮，只显示“我的订单”和可选的联系支持。非首页公开页才提供返回首页入口。
- 公告与搜索：不在 Hero 区重复展示站点名称；公告在左、商品搜索在右。搜索应与分类筛选同时生效。
- 商品区：分类筛选与商品列表同处；商品卡片使用固定横向封面比例，未配置封面时使用 `assets/product_img.jpg`，图片以 `object-cover` 填满图片区。
- 商品卡片仅展示分类、名称/副标题、库存或交付说明与价格；点击整张卡片进入商品详情，不额外堆叠重复的“查看商品”按钮。
- 色彩：公开商城只使用组件默认的黑、白、灰色阶，以及 Logo 的蓝色与橙色；不得使用红色、绿色、黄色、紫色等额外状态色。缺货状态使用 Logo 橙色（`text-orange-500`），普通库存说明使用 `text-muted-foreground`；不得使用 `text-destructive`。

### 1.6 破坏性操作

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
  } catch {
    // runTelefunc 已显示脱敏错误提示。
  } finally {
    saving.value = false;
  }
}
```

## 2. 后台信息架构、目录与导航元数据

后台导航、路由、页面目录和面包屑必须使用同一棵层级树，唯一来源为 `lib/admin-navigation.ts`。禁止侧栏、模块内部导航、面包屑和文件目录各自维护一套层级或路径。

### 2.1 层级、目录与路由

后台最多三级：**一级菜单分组 -> 二级模块或页面 -> 三级模块页**。

- **一级菜单**是业务分组，只负责归类，不生成同名页面或 URL。它对应稳定路由前缀和 `pages/@adminPath/<prefix>/` 目录。
- **二级菜单**是侧栏在一级分组下显示的可访问项。二级模块的首页为 `/<prefix>/<module>`。
- **三级菜单**是二级模块的内部页面，路径为 `/<prefix>/<module>/<page>`。三级项只在该模块内部导航显示，绝不与二级项并列显示在侧栏，也不能有第二个入口。
- 仅不属于业务分组的独立页面可使用根级路径，例如 `/dash`、`/orders`。
- URL 必须与 `pages/@adminPath` 的相对目录一一对应；一个页面只能有一个正式 URL。修改路径时移动真实目录、更新集中元数据和调用方、删除旧目录。不得保留兼容跳转、别名 URL、平行路径或重复菜单入口。

当前正式结构：

| 一级菜单 | 正式路由前缀 | 页面目录 | 二级项 | 三级项 |
| --- | --- | --- | --- | --- |
| 面板 | `/dash` | `pages/@adminPath/dash` | 面板 | 无 |
| 商品管理 | `/catalog/*` | `pages/@adminPath/catalog` | 分类、商品、卡密、折扣码 | 无 |
| 订单管理 | `/orders` | `pages/@adminPath/orders` | 订单管理 | 无 |
| 推送管理 | `/push/*` | `pages/@adminPath/push` | 推送配置、发送日志、电子邮件、企业微信、Telegram | 电子邮件：邮件统计、通道配置、邮件模板 |
| 系统配置 | `/system/*` | `pages/@adminPath/system` | 支付渠道、媒体存储、站点配置、安全配置、任务 | 无 |
| 用户管理 | — | — | 当前不提供用户或管理员管理页面；唯一 root 仅由 `adminBootstrap(id=1)` 指定 | 无 |

电子邮件模块的唯一首页为 `/push/email`；其三级页面只能为 `/push/email/post-office`、`/push/email/templates` 等同前缀路径。不得再创建 `/mail/*`、`/notifications/*`、`/push/email/overview` 或任何兼容入口。

### 2.2 集中元数据

所有后台业务页面都必须在 `lib/admin-navigation.ts` 的 `adminPages` 注册，且页面元数据必须完整包含：

```ts
{
  title: "侧栏与面包屑名称",
  path: "/route-path",
  pageTitle: "页面 H1",
  description: "页面副标题",
}
```

`adminPages` 与 `adminNavigation` 是后台信息架构的唯一来源：

- `title` 用于侧栏、模块导航和面包屑。
- `pageTitle` 和 `description` 用于 `AdminPageHeader` 或模块布局的页头。
- `AdminSidebar`、后台 Layout 与模块内部导航只能引用这些集中定义，不得复制标题或维护页面私有路由映射。
- 二级模块以 `AdminNavigationModule` 定义其三级页面；模块首页元数据和三级页元数据都在 `adminPages` 注册。

新增或调整后台页面时：

1. 在 `adminPages` 注册页面元数据。
2. 将页面或二级模块加入既有 `adminNavigation` 一级分组，不复制 `title`、`path`。
3. 在 `pages/@adminPath` 创建与 `path` 一致的 `+Page.vue`；普通页面顶层使用 `<AdminPageHeader />`。
4. 新增三级页时，把它加入所属二级模块的 `items`；不得加入一级菜单的二级项列表。
5. 不能实现的菜单功能必须提供真实空状态页，不能保留无效链接或伪造可保存配置。

登录页和其他认证入口不属于后台业务页面，无需注册为 `adminPages`。

## 3. 后台列表规范

### 2.1 必须使用 `AdminDataTable`

所有后台管理中的实体列表（商品、订单、卡密、优惠码、媒体文件、推送记录等）必须使用：

```vue
<AdminDataTable :columns="columns" :rows="data.items" row-key="id">
  <template #toolbar><!-- 筛选、刷新、新增操作 --></template>
  <template #cell-status="{ row }"><Badge>{{ row.status }}</Badge></template>
  <template #actions="{ row }"><!-- 行操作 --></template>
  <template #pagination><!-- Pagination --></template>
</AdminDataTable>
```

详细 API 见 [components.md](./components.md)。实体列表没有行操作时必须传 `:show-actions="false"`；仪表盘摘要表不是实体管理列表，可使用基础 `Table`。

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

## 4. 列表 Telefunc 接口契约

### 4.1 查询参数

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

### 4.2 返回结构

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
    const result = await runTelefunc(
      () => onGetEntityAdminData({
        ...filters,
        page: page.value,
        pageSize: pageSize.value,
      }),
      { notifyError: false },
    );
    Object.assign(data, result);
  } catch (cause) {
    loadError.value = userErrorMessage(cause);
  }
}
```

## 5. Telefunc 错误设计与统一处理

### 5.1 调用边界：Telefunc 与 HTTP API 分开规范

项目同时使用 Telefunc RPC 和少量 Hono HTTP 接口；两者不能混用响应约定。

- **页面到项目服务端的业务调用：使用 Telefunc。** 成功时直接返回业务数据；预期业务失败时抛出 `AppError`/稳定错误码。不要为 Telefunc 添加 `{ code, message, data }` 包装层。
- **公开或第三方 HTTP API：使用 HTTP 状态码与 JSON 信封** `{ code, message, data }`。`code: 0` 代表成功；`400/401/403/404/409` 携带稳定业务码；未预期异常返回 `500` 和 `INTERNAL_ERROR`。
- **协议回调例外：** 支付回调等由第三方协议规定响应格式的路由，保留协议要求的纯文本/签名响应，不能强制套 JSON 信封。

### 5.2 Telefunc 服务端：稳定错误码，不泄露内部信息

Telefunc 应在权限、输入校验、状态机校验失败时抛出稳定、全大写的业务错误码：

```ts
if (!context.user || !context.isAdmin) {
  appError("ADMIN_ACCESS_REQUIRED");
}
if (!Number.isInteger(input.id) || input.id < 1) {
  appError("ENTITY_ID_INVALID");
}
if (!record) {
  appError("ENTITY_NOT_FOUND");
}
if (record.status !== "DRAFT") {
  appError("ENTITY_DELETE_REJECTED");
}
```

规则：

- 错误码使用 `UPPER_SNAKE_CASE`，按资源和语义命名，例如 `CARD_CONTENT_REQUIRED`、`PRODUCT_NOT_CARD_AUTO`、`CARD_DELETE_REJECTED`。
- 不将数据库异常、SQL、堆栈、第三方支付原始响应或敏感值直接传给客户端。
- 对“删除/状态切换”等并发敏感操作，将可操作状态写进 `where` 条件；根据 `returning()` 是否返回记录判断结果。
- 未预期异常必须交给全局错误处理：完整接口信息、原始异常和堆栈输出到 Cloudflare Workers Observability；客户端仍只显示通用错误文案。
- 数据库业务日志只脱敏 `sign`、密码、token、API key、Secret、私钥和 access key；不要将这些值写回支付、邮件或推送日志。

### 5.3 前端：必须通过 `runTelefunc()` 统一处理

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

### 5.4 全局服务端错误处理与 Workers Observability

Hono、Telefunc 与 Vike SSR / `+data.server.ts` 的未预期异常必须进入同一个全局错误处理模块。该模块的职责是：

1. 将原始 `Error`、堆栈、完整接口路径、查询参数、请求体或表单参数输出到 Cloudflare Workers Observability；此记录不脱敏，仅供 root 通过 Cloudflare 控制台排查。
2. 按协议返回脱敏结果：HTTP API 返回 `INTERNAL_ERROR` JSON，Telefunc 继续抛出异常供 `runTelefunc()` 映射，支付回调返回 `failure`。
3. 不把 Observability 的原始内容复制到前端或数据库业务日志。

预期业务错误码不是未预期异常：它们仍按 `lib/error-messages.ts` 映射并显示给用户，无需伪装为内部错误。

### 5.5 HTTP API 客户端与 500 错误

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

## 6. 推送模块路由

推送模块的正式路由统一为 `/push/*`，页面与导航元数据必须使用同一条路径：

- `/push/config`：推送配置
- `/push/history`：发送日志
- `/push/email`：电子邮件二级模块首页（邮件统计）
- `/push/email/post-office`、`/push/email/templates`：电子邮件三级页面
- `/push/wecom`：企业微信
- `/push/telegram`：Telegram

电子邮件只作为“推送管理”下的一个二级模块显示一次；邮件统计、通道配置和邮件模板只能作为该模块的三级页面出现，不能在推送管理下另列为并列二级项。不得在推送模块新增或保留 `/mail/*`、`/notifications/*` 等平行路径。推送规则统一由 `server/push` 管理，页面通过推送配置决定订单事件是否向客户或唯一 root 投递。渠道实现实际投递时，必须同步写入 `pushLog`；不要为邮件、企业微信或 Telegram 分别创建重复的发送日志页面。

`pushLog` 是后台“发送日志”的唯一数据源。渠道尚未具备发送能力时，只保存配置，不得生成伪造的成功或失败记录。

## 7. 新功能完成前检查

提交前至少完成：

1. 对修改的 `.vue` / `.ts` 文件运行 diagnostics。
2. 运行 `npm run lint`；不能新增 warning 或 error。
3. 运行 `npm run build`。
4. 新增或调整后台页时，确认 `adminPages` 的 `title`、`path`、`pageTitle`、`description` 完整，且页面通过 `AdminPageHeader` 或模块布局读取它们。
5. 手动验证至少一个成功路径、一个输入错误路径和一个破坏性操作确认路径。
6. 运行相关 `tests/**/*.test.ts`：管理授权必须覆盖 guest / user / root，前端错误必须验证未知原始错误不透出，数据库日志必须验证 `sign` 与密钥不入库；未预期异常的测试应验证完整请求与堆栈会交给 Observability 输出。
7. 检查列表响应和前端错误未泄露敏感字段、原始异常或密钥；数据库日志已移除 `sign` 与密钥；部署后在 Workers Observability 查询完整接口信息，并确认筛选、分页、空状态和 Toast 行为符合本规范。
