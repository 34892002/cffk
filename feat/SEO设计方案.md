# CFFK SEO 设计方案

> 本文只覆盖两个阶段：
>
> - 第一阶段：全局站点元数据、页面级 title/description、favicon，以及高效的 Worker 缓存方案
> - 第二阶段：Open Graph、Twitter Card、canonical 等 SEO 标签完善
>
> 本方案以当前 `cffk` 的 Vike + Vue + Cloudflare Workers + D1 架构为基础，不引入 KV，也不做整页 HTML 缓存。

## 1. 设计目标

### 1.1 功能目标

为所有公开页面提供统一、可配置、可扩展的站点信息：

- 网站名称
- 网站副标题/默认 description
- favicon
- Logo
- 站点 URL
- 页面 title
- 页面 description
- canonical URL
- Open Graph 分享信息
- Twitter Card 分享信息

同时支持页面级覆盖：

- 首页使用站点默认 title/description
- 商品详情页使用商品名称和商品描述生成动态 title/description
- 后台、订单、支付结果等页面可以使用固定标题，并默认关闭或限制 SEO 信息

### 1.2 性能目标

- SSR 首次返回的 HTML 必须包含正确的 title、description 和 head 标签
- 不依赖客户端 mounted 或 hydration 后再修改 SEO 标签
- 站点配置不应在每个页面请求中重复查询 D1
- 站点配置更新后允许短时间最终一致，但不应永久使用旧值
- 页面数据和站点元数据职责分离，避免公共 hook 查询业务数据

### 1.3 非目标

本阶段不实现：

- KV 分布式缓存
- 完整 HTML 的 Cloudflare Cache API 缓存
- sitemap.xml
- robots.txt
- 结构化数据 JSON-LD
- 多语言 SEO
- 后台站点配置表单的实现代码（本文定义其设计，具体实现按开发任务落地）
- 商品列表的预渲染或静态生成

这些能力可以在后续阶段单独设计。

---

## 2. 当前项目现状

### 2.1 Vike 配置

当前 `cffk/pages/+config.ts` 只有静态默认值：

```ts
const config: Config = {
  title: "CFFK发卡",
  description: "",
  passToClient: ["user", "isAdmin"],
  extends: [vikeVue],
};
```

该配置适合作为构建期 fallback，但不能反映 D1 中的站点设置。

### 2.2 站点配置表

当前 `cffk/database/drizzle/schema.ts` 的 `siteSetting` 已包含：

```text
siteName
siteUrl
siteSubtitle
logo
notice
supportContact
footerText
orderNotice
headCode
footerCode
timezone
```

当前没有独立的 favicon 字段。第一阶段建议增加：

```text
logoIcon
```

如果暂时不希望增加数据库迁移，也可以先使用 `logo` 作为 favicon fallback；但从产品语义和后台配置角度看，独立的 `logoIcon` 更清晰。

### 2.3 页面数据

当前首页 `cffk/server/catalog/public.ts` 的 `getPublicCatalog()` 已经查询部分站点信息；商品详情页 `cffk/pages/product/@slug/+data.server.ts` 查询商品和支付渠道，但没有全局站点上下文。

因此实现时必须避免：

```text
根级 onBeforeRender 查询 siteSetting
首页 +data.server.ts 再次查询 siteSetting
```

---

## 3. 总体架构

```text
D1 siteSetting
    │
    ▼
getPublicSiteSettings()
    │
    ├── Worker isolate 内存缓存
    │       └── TTL 60 秒
    │
    ▼
根级 pages/+onBeforeRender.ts
    │
    ▼
pageContext.site
    │
    ├── +title.ts
    ├── +description.ts
    ├── +Head.vue
    ├── 根布局/Layout
    └── 页面级 title/description/head 覆盖
```

核心原则：

1. D1 是唯一真实来源
2. Worker isolate 内存缓存是读取优化，不是持久化存储
3. 根级 `+onBeforeRender.ts` 只负责轻量公共站点配置
4. 页面专属数据仍由各页面自己的 `+data.server.ts` 负责
5. SEO 标签在 SSR 阶段生成
6. 页面级配置优先于全局默认配置

---

# 第一阶段：全局站点元数据与页面级配置

## 4. 第一阶段文件规划

计划新增或调整以下文件：

```text
cffk/
├── pages/
│   ├── +onBeforeRender.ts
│   ├── +title.ts
│   ├── +description.ts
│   ├── +Head.vue
│   ├── +config.ts
│   ├── index/
│   │   └── +title.ts                 # 可选：首页特殊标题时使用
│   └── product/@slug/
│       ├── +title.ts
│       └── +description.ts
├── pages/@adminPath/system/settings/
│   └── +Page.vue                      # 站点与 SEO 配置表单
├── server/
│   └── site/
│       ├── admin.telefunc.ts          # root 读取/保存站点配置
│       ├── public-settings.ts         # 查询与缓存公共站点配置
│       └── types.ts                   # 公共类型，可选
├── lib/validators/
│   └── site.ts                        # 服务端站点配置校验
├── database/
│   ├── drizzle/schema.ts              # 增加 logoIcon，可选
│   └── migrations/                    # 对应迁移文件
└── docs/
    └── SEO设计方案.md
```

如果项目最终决定复用已有 `logo` 作为 favicon，则可以不新增 `logoIcon` 和对应迁移文件，但 `+Head.vue` 中必须保留默认 favicon fallback。

## 4.1 后台站点配置表单设计

当前 `pages/@adminPath/system/settings/+Page.vue` 是空状态页。本阶段需要将其实现为正式的站点配置表单，页面只负责编辑和提交，不在组件内直接访问 D1。

### 页面结构

页面使用项目现有的后台页面结构：

```vue
<section class="flex w-full flex-col gap-6">
  <AdminPageHeader />
  <Alert v-if="error" variant="destructive" />
  <Card>
    <CardHeader />
    <form>
      <CardContent />
      <CardFooter />
    </form>
  </Card>
</section>
```

必须复用：

- `AdminPageHeader`
- `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`CardFooter`
- `Input`
- `Textarea`
- `Select`、`SelectTrigger`、`SelectContent`、`SelectItem`
- `Button`
- `Alert`（仅用于持续性的加载/初始化失败状态）
- `runTelefunc` 和 `userErrorMessage`

不得在业务页面直接使用原生 `<input>`、`<textarea>`、`<select>` 或 `<button>`。

### 表单分组

表单建议按以下顺序分组，桌面端使用 `md:grid-cols-2`，移动端自动单列：

#### 站点基础信息

| 表单字段 | 数据库字段 | 控件 | 规则 |
|---|---|---|---|
| 站点名称 | `siteName` | `Input` | 必填，最多 120 个字符 |
| 副标题 / 默认 SEO 描述 | `siteSubtitle` | `Input` | 可选，最多 300 个字符 |
| 网站地址 | `siteUrl` | `Input type="url"` | 可选，只允许 `http`/`https` |
| 站点时区 | `timezone` | `Select` | 必填，必须是运行时可识别的 IANA 时区 |

`siteSubtitle` 同时作为公开首页副标题和默认 SEO description，因此标签必须明确说明其 SEO 用途。

#### 品牌资源

| 表单字段 | 数据库字段 | 控件 | 规则 |
|---|---|---|---|
| 网站 Favicon 地址 | `logoIcon` | `Input type="url"` | 可选，公开可访问的图标地址 |
| 网站 Logo 地址 | `logo` | `Input type="url"` | 可选，公开商城导航和分享图 fallback |

本阶段不在设置页内实现文件上传。图片上传沿用系统配置中的媒体存储页面，设置页只保存公开 URL。后续如果要集成媒体选择器，应复用现有媒体接口和组件，不在此页面新增第二套上传逻辑。

favicon fallback 顺序：

```text
logoIcon -> logo -> 项目内置 favicon
```

#### 公开商城内容

| 表单字段 | 数据库字段 | 控件 | 规则 |
|---|---|---|---|
| 首页公告 | `notice` | `Textarea` | 可选，最多 2,000 个字符 |
| 客服联系方式 | `supportContact` | `Textarea` | 可选，最多 2,000 个字符 |
| 页脚文案 | `footerText` | `Textarea` | 可选，最多 1,000 个字符 |
| 下单提示 | `orderNotice` | `Textarea` | 可选，最多 2,000 个字符 |

客服联系方式继续沿用当前公开页面的文本约定：

```text
每行一条
显示文字|链接地址
```

没有 `|` 时整行作为纯文本展示；有 `|` 时左侧作为显示文字，右侧作为链接。服务端保存时只做 trim 和长度校验，不替换或拼接 HTML。

#### 自定义代码

| 表单字段 | 数据库字段 | 控件 | 规则 |
|---|---|---|---|
| 页头代码（head） | `headCode` | `Textarea` | 可选，最多 20,000 个字符 |
| 页脚代码（body） | `footerCode` | `Textarea` | 可选，最多 20,000 个字符 |

该分组必须有持续可见的安全提示：代码会注入公开页面，只允许管理员填写可信代码，禁止填写密钥、令牌或用户数据。

自定义代码不属于 SEO 元数据，但当前数据库已存在这两个字段，因此在站点设置页统一管理；其注入策略必须单独遵循页面 Layout 的安全边界，不得把任意代码拼入 SEO 属性。

### 加载和保存流程

页面加载：

```text
onMounted
  -> runTelefunc(onGetSiteSettings)
  -> 用返回值填充 reactive form
```

保存：

```text
提交表单
  -> 按钮进入“保存中...”并禁用
  -> runTelefunc(onSaveSiteSettings)
  -> 服务端 requireAdmin
  -> 服务端校验并 upsert siteSetting(id=1)
  -> 清理当前 Worker isolate 的站点缓存
  -> 返回规范化记录
  -> 更新表单并 Toast 提示“站点设置已保存。”
```

短暂反馈必须使用 `runTelefunc` 的 Sonner Toast。不要在页面底部增加常驻成功提示；初始化失败或需要用户持续注意的错误才使用页面级 `Alert`。

### 服务端接口

建议新增：

```text
server/site/admin.telefunc.ts
```

接口：

```ts
export async function onGetSiteSettings(): Promise<SiteSettingsRecord>;
export async function onSaveSiteSettings(input: SiteSettingsInput): Promise<SiteSettingsRecord>;
```

要求：

- 两个接口都必须调用 `requireAdmin()`，不能只依赖前端路由 guard
- `onGetSiteSettings` 返回表单需要的字段，不返回无关数据库数据
- `onSaveSiteSettings` 使用 singleton `siteSetting.id = 1` upsert
- 更新 D1 成功后才清理内存缓存
- 不记录 `headCode`、`footerCode` 原文到业务日志
- 服务端错误使用项目错误码，前端通过 `userErrorMessage` 脱敏显示

### 服务端校验

建议新增：

```text
lib/validators/site.ts
```

校验必须在服务端执行，前端的 `required`、`maxlength` 和 `type="url"` 只用于改善输入体验，不能作为安全边界。

URL 校验规则：

1. 空字符串规范化为 `null`
2. 使用 `new URL(value)` 解析
3. 只允许 `http:` 和 `https:`
4. 去除首尾空白
5. 不允许将脚本协议、data URL 或任意非 HTTP 协议保存为公开资源 URL

文本规则：

- 所有可选文本 trim 后空值保存为 `null`
- 按字段限制最大长度
- 不在保存时自动注入 HTML
- `headCode` 和 `footerCode` 只做长度限制，不在本接口执行脚本

### 数据库变更

如果采用独立 favicon 配置，应在 `siteSetting` 增加：

```ts
logoIcon: text("logoIcon"),
```

同时生成一条 Drizzle migration。因为当前项目仍处于开发阶段，不保留兼容字段或平行配置来源；公共页面统一使用 `logoIcon -> logo` fallback。

### 表单验收标准

- [x] `/admin/system/settings` 不再显示“功能尚未接入”
- [x] 页面首次加载能显示数据库已有配置或默认值
- [x] 非 root 用户不能通过直接调用 Telefunc 读取或保存配置
- [x] 站点名称为空时服务端拒绝保存
- [x] 非 HTTP/HTTPS 的网站、Logo、favicon 地址被拒绝
- [x] 所有字段的最大长度在服务端校验
- [x] 保存按钮在请求期间禁用，避免重复提交
- [x] 保存成功使用 Sonner Toast
- [x] 保存失败显示脱敏错误信息
- [x] 保存成功后当前 Worker isolate 的公共站点缓存失效
- [x] 刷新公开页面可以看到新的站点名称、公告、Logo 和 favicon
- [x] 桌面端表单使用两列布局，窄屏自动切换单列
- [x] 页面只使用项目已有 UI 组件，不新增原生表单控件

---

## 5. 公共站点配置模型

建议将用于页面渲染的配置裁剪为以下类型：

```ts
export type PublicSiteSettings = {
  name: string;
  subtitle: string | null;
  description: string;
  siteUrl: string | null;
  logo: string | null;
  logoIcon: string | null;
  notice: string | null;
  supportContact: string | null;
  footerText: string | null;
};
```

字段规则：

| 字段 | 来源 | 用途 | 是否传给客户端 |
|---|---|---|---|
| `name` | `siteName` | 默认 title、Layout、OG title | 是 |
| `subtitle` | `siteSubtitle` | 页面展示、副标题 fallback | 是 |
| `description` | `siteSubtitle` 或 fallback | 默认 meta description | 是 |
| `siteUrl` | `siteUrl` | canonical、OG URL | 是 |
| `logo` | `logo` | 页面 Layout Logo | 是 |
| `logoIcon` | `logoIcon` 或 `logo` | favicon、OG 默认图片 | 是 |
| `notice` | `notice` | 首页展示 | 是 |
| `supportContact` | `supportContact` | 联系方式 | 是 |
| `footerText` | `footerText` | 页脚展示 | 是 |

以下字段不应放入公共 SEO 上下文：

- `headCode`
- `footerCode`
- `orderNotice`
- `timezone`

它们属于业务或管理功能配置，应按实际使用页面单独读取，避免无关字段被序列化到所有页面。

### 5.1 默认值

```ts
const DEFAULT_SITE_NAME = "CFFK发卡";
const DEFAULT_SITE_DESCRIPTION = "自动发卡系统";
```

规则：

```text
siteName       -> DEFAULT_SITE_NAME
siteSubtitle   -> DEFAULT_SITE_DESCRIPTION
siteUrl        -> null
logo           -> 内置 logo
logoIcon       -> logoIcon || logo || 内置 favicon
```

默认值必须在服务端和 head 生成逻辑中保持一致，避免 SSR 与客户端 hydration 出现不同结果。

---

## 6. D1 读取与 Worker 缓存设计

### 6.1 缓存位置

使用模块级 `WeakMap<D1Database, CacheEntry>` 保存 Worker isolate 内存缓存：

```ts
type CacheEntry = {
  value: PublicSiteSettings;
  expiresAt: number;
};

const settingsCache = new WeakMap<D1Database, CacheEntry>();
```

选择 `WeakMap` 的原因：

- 不同 D1 binding 不会共享配置
- 测试和本地环境更加安全
- 不需要手动维护数据库对象生命周期
- 适合 Cloudflare Worker isolate 的长生命周期复用

### 6.2 TTL

第一阶段默认 TTL：

```text
60 秒
```

理由：

- 站点名称、description、favicon 都是低频变更数据
- 不会明显增加 D1 读取
- 配置修改后的延迟可接受
- 比永久缓存更安全

可以将 TTL 抽成常量，便于后续调整：

```ts
const PUBLIC_SITE_SETTINGS_TTL_MS = 60_000;
```

### 6.3 读取流程

```text
请求进入 Worker
    │
    ▼
检查当前 isolate 的内存缓存
    │
    ├── 未过期：直接返回缓存
    │
    └── 未命中/已过期：查询 D1
                              │
                              ▼
                        规范化字段
                              │
                              ▼
                        写入内存缓存
                              │
                              ▼
                        返回站点配置
```

### 6.4 主动失效

站点配置保存成功后，应调用：

```ts
invalidatePublicSiteSettings(env.DB);
```

流程：

```text
后台保存配置
    │
    ▼
D1 写入成功
    │
    ▼
清理当前 Worker isolate 缓存
    │
    ▼
下一次请求重新读取 D1
```

主动失效不能替代 TTL，因为 Cloudflare 可能同时运行多个 isolate。其他 isolate 仍然依赖 TTL 最终刷新。

### 6.5 不使用 KV 的理由

第一阶段不使用 KV：

- 配置只有单行或少量字段
- 读取频率低
- D1 是已有依赖
- Worker 内存缓存已经能消除绝大多数重复读取
- KV 仍然是最终一致性，不能完全解决同步问题
- 引入 KV 会增加 binding、部署和失效逻辑

当前推荐：

```text
D1 + Worker isolate 内存缓存 + 60 秒 TTL
```

---

## 7. 根级 Vike 集成

### 7.1 `pages/+onBeforeRender.ts`

根级 `+onBeforeRender.ts` 负责获取公共站点设置，并将其写入 `pageContext.site`。

伪代码：

```ts
import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";
import { getPublicSiteSettings } from "@/server/site/public-settings";

export async function onBeforeRender(pageContext: PageContextServer) {
  const site = await getPublicSiteSettings(env.DB);

  return {
    pageContext: {
      site,
    },
  };
}
```

要求：

- 只查询公共站点配置
- 不查询商品、库存、订单或支付数据
- 不能阻塞不需要 SEO 的静态资源请求
- 发生配置查询异常时使用安全 fallback，不应导致所有页面无法渲染

对于需要登录保护的后台页面，也可以继续注入轻量站点配置；但不得因为 SEO 配置查询改变后台鉴权逻辑。

### 7.2 `passToClient`

如果 Layout 或 Vue 组件需要使用 `pageContext.site`，需要将 `site` 加入客户端传输配置：

```ts
passToClient: ["user", "isAdmin", "site"],
```

只允许传递裁剪后的公共字段，不要直接把数据库完整记录放进 `pageContext`。

### 7.3 全局 `+title.ts`

根级默认 title 规则：

```text
页面自定义 title
    -> site.name
    -> DEFAULT_SITE_NAME
```

伪代码：

```ts
export default function title(pageContext: PageContext) {
  return pageContext.site?.name || "CFFK发卡";
}
```

### 7.4 全局 `+description.ts`

根级默认 description 规则：

```text
页面自定义 description
    -> site.description
    -> site.subtitle
    -> DEFAULT_SITE_DESCRIPTION
```

description 必须是纯文本，去除换行和多余空白，并建议限制在约 160 个字符以内。

### 7.5 全局 `+Head.vue`

根级 `+Head.vue` 负责：

- favicon
- 默认 charset/viewport 之外的站点 head 标签
- 第二阶段的 Open Graph/Twitter/canonical
- 页面上下文变化时由 Vike 处理 head 更新

favicon 规则：

```text
site.logoIcon
    -> site.logo
    -> /favicon.ico 或项目内置 favicon
```

不要只在 `onMounted` 中设置 favicon，因为爬虫和社交平台通常不会等待客户端 mounted。

---

## 8. 页面级 title/description 规则

### 8.1 首页

默认首页 title：

```text
{siteName}
```

默认首页 description：

```text
{siteSubtitle || 默认站点描述}
```

如后续需要品牌后缀，可以统一改为：

```text
{siteName} - {siteSubtitle}
```

但不建议首页 title 同时重复站点名称。

### 8.2 商品详情页

商品详情页使用动态 SEO：

```text
title: {product.name} - {site.name}
description: {product.subtitle || product.description 摘要 || site.description}
```

示例：

```text
title: Minecraft Java版账号 - CFFK发卡
description: 正版 Minecraft Java 版账号，购买后自动发货。
```

商品描述摘要规则：

1. 优先使用 `product.subtitle`
2. 没有 subtitle 时使用 `product.description`
3. 去除 HTML 标签、换行和多余空格
4. 截取合适长度，避免生成过长 meta description
5. 没有商品描述时回退到站点默认 description

商品的 title/description 必须来自服务端页面数据，不能在 Vue 组件 mounted 后才设置。

### 8.3 订单、支付结果页

订单和支付结果页包含用户私有或交易状态信息，不适合被搜索引擎收录。

第一阶段的 title 可以设置为固定值：

```text
订单查询 - {siteName}
支付结果 - {siteName}
```

第二阶段应为这些页面增加：

```html
<meta name="robots" content="noindex,nofollow,noarchive">
```

### 8.4 注册页和后台页

注册页、后台登录页、后台管理页默认不参与 SEO：

```html
<meta name="robots" content="noindex,nofollow,noarchive">
```

后台页面不能因为使用了全局 `+Head.vue` 而生成可被搜索引擎收录的公共页面信息。

---

## 9. 第一阶段验收标准

### 功能验收

- [x] 修改站点名称后，首页 SSR HTML 中的 `<title>` 使用新名称
- [x] 修改站点副标题后，默认 `<meta name="description">` 使用新内容
- [x] 所有公开页面都有 favicon
- [x] favicon 优先使用数据库配置，未配置时使用默认资源
- [x] 商品详情页 title 包含商品名称
- [x] 商品详情页 description 优先使用商品 subtitle/description
- [x] 没有商品时不会因为 SEO 逻辑抛出额外异常
- [x] 订单、支付、后台页面不会错误使用商品详情页的 SEO 数据

### 性能验收

- [x] 根级 hook 不查询商品、库存、支付和订单数据
- [x] 同一 Worker isolate 内，站点设置在 TTL 内不会重复查询 D1
- [x] 首页不再因为全局 SEO 配置重复读取 `siteSetting`
- [x] 页面传给客户端的 site 对象只包含公共字段
- [x] 站点配置查询失败时页面使用安全默认值，而不是全站 500

### SSR 验收

使用 `curl` 或浏览器查看服务端原始 HTML，确认以下内容在首屏 HTML 中存在：

```html
<title>...</title>
<meta name="description" content="...">
<link rel="icon" href="...">
```

不能只通过浏览器开发者工具在 hydration 后看到结果。

---

# 第二阶段：SEO 标签完善

## 10. 第二阶段标签范围

第二阶段在第一阶段的 `+Head.vue` 和页面级数据基础上增加：

- `description`
- `canonical`
- `og:title`
- `og:description`
- `og:type`
- `og:url`
- `og:image`
- `og:site_name`
- `twitter:card`
- `twitter:title`
- `twitter:description`
- `twitter:image`
- 可选的 `theme-color`
- 页面级 `robots`

所有标签必须在 SSR 阶段生成。

---

## 11. URL 规范化

### 11.1 `siteUrl` 规则

`siteUrl` 是 canonical 和 Open Graph URL 的首选来源。

使用前进行规范化：

1. 去除首尾空格
2. 只允许 `http:` 或 `https:`
3. 去除结尾 `/`
4. 无效值回退到当前请求 origin
5. 如果仍无法确定 origin，则不生成 canonical 和 `og:url`

示例：

```text
https://shop.example.com/
```

规范化为：

```text
https://shop.example.com
```

### 11.2 页面 canonical

canonical 生成规则：

```text
canonical = normalizedSiteUrl + pageContext.urlPathname
```

要求：

- 只使用 pathname，不把敏感 query 参数放入 canonical
- 订单 token、支付参数、后台参数不得进入 canonical
- 商品详情页 canonical 应为稳定的 `/product/{slug}`
- 尾部 `/` 规则全站统一

示例：

```text
https://shop.example.com/product/minecraft-account
```

### 11.3 不生成 canonical 的页面

以下页面默认不生成公共 canonical，或者使用 noindex：

- 后台页面
- 订单查询页
- 支付结果页
- 错误页
- 带敏感查询参数的页面

---

## 12. Open Graph 设计

### 12.1 公共默认值

首页默认：

```html
<meta property="og:type" content="website">
<meta property="og:title" content="站点名称">
<meta property="og:description" content="站点描述">
<meta property="og:site_name" content="站点名称">
<meta property="og:url" content="规范化页面 URL">
```

### 12.2 商品详情页

商品详情页：

```html
<meta property="og:type" content="product">
<meta property="og:title" content="商品名称 - 站点名称">
<meta property="og:description" content="商品描述摘要">
<meta property="og:site_name" content="站点名称">
<meta property="og:url" content="商品 canonical URL">
<meta property="og:image" content="商品封面图">
```

如果商品没有封面图，回退顺序：

```text
product.coverImage
    -> site.logoIcon
    -> site.logo
    -> 默认分享图
```

### 12.3 图片 URL

社交平台通常需要绝对 URL，因此：

- 已经是 `http://` 或 `https://` 的地址直接使用
- `/assets/...` 等相对地址拼接 `siteUrl` 或当前 origin
- 无法生成绝对 URL 时不输出 `og:image`，避免生成无效标签

图片建议：

- 使用可公开访问的 HTTPS URL
- 商品封面图应避免需要登录或 cookie
- 推荐分享图比例接近 1.91:1
- favicon 不应作为理想的 OG 图片，只能作为 fallback

---

## 13. Twitter Card 设计

默认使用：

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="页面标题">
<meta name="twitter:description" content="页面描述">
<meta name="twitter:image" content="分享图片">
```

如果没有适合的大图，可以使用：

```html
<meta name="twitter:card" content="summary">
```

建议第二阶段统一使用 `summary_large_image`，并确保 fallback 图片可访问。

不在数据库中单独维护 Twitter 文案；默认复用：

```text
twitter:title       = og:title
twitter:description = og:description
twitter:image      = og:image
```

这样可以避免维护两套内容导致不一致。

---

## 14. Head 数据模型

建议在服务端为每个页面生成统一的 `SeoMeta` 对象：

```ts
export type SeoMeta = {
  title: string;
  description: string;
  canonicalUrl: string | null;
  ogType: "website" | "product";
  ogUrl: string | null;
  ogImage: string | null;
  siteName: string;
  robots: string | null;
};
```

生成优先级：

```text
页面数据/页面配置
    -> 公共站点配置
    -> 系统默认值
```

建议把文本清洗和 URL 规范化放在服务端工具函数中，而不是散落在 Vue 模板中。

### 14.1 文本清洗

SEO 文本处理要求：

- 去除 HTML 标签
- 将换行和连续空白压缩为单个空格
- 对 HTML attribute 由 Vue/Vike 负责安全转义
- description 限制最大长度
- 不把订单号、query token、邮箱等敏感内容写入 SEO 标签

### 14.2 title 长度

建议目标长度：

```text
约 30~60 个字符
```

商品名称过长时，应优先保证商品核心名称，不强行拼接过长的站点名称。

### 14.3 description 长度

建议目标长度：

```text
约 80~160 个字符
```

这不是硬性截断标准，但需要避免把整篇商品详情原文直接放入 description。

---

## 15. 页面 SEO 矩阵

| 页面 | title | description | canonical | OG | robots |
|---|---|---|---|---|---|
| 首页 `/` | 站点名称 | 站点副标题/默认描述 | 是 | website | 默认 |
| 商品详情 `/product/:slug` | 商品名 - 站点名 | 商品摘要 | 是 | product | 默认 |
| 订单查询 `/order` | 订单查询 - 站点名 | 固定描述或站点描述 | 否或 noindex | 不重点生成 | noindex |
| 支付结果 `/payment-result` | 支付结果 - 站点名 | 固定描述 | 否 | 不重点生成 | noindex |
| 初始化 `/setup` | 初始化管理员账号 - 站点名 | 固定描述 | 否或 noindex | 不重点生成 | noindex |
| 后台登录 | 后台登录 - 站点名 | 固定描述 | 否 | 不生成公共 OG | noindex |
| 后台管理 | 页面名 - 站点名 | 不重要 | 否 | 不生成公共 OG | noindex |
| 错误页 | 页面未找到 - 站点名 | 固定描述 | 否 | 不生成 | noindex |

---

## 16. 页面配置约定

页面级 SEO 配置建议使用 Vike 文件约定，而不是在 Vue 组件中手动操作 `document.title`。

示例文件：

```text
pages/product/@slug/+title.ts
pages/product/@slug/+description.ts
```

页面 title/description 的函数应只依赖：

- `pageContext.site`
- 当前页面已经加载的数据
- 当前路由参数

不要在 `+title.ts` 或 `+description.ts` 中单独再次查询 D1。页面需要的数据应由对应的 `+data.server.ts` 一次性提供。

如果某个页面不需要动态逻辑，也可以使用静态配置：

```ts
export default {
  title: "订单查询",
};
```

但最终展示时仍建议统一拼接站点名称：

```text
订单查询 - CFFK发卡
```

---

## 17. `+Head.vue` 责任边界

根级 `+Head.vue` 负责渲染统一标签，但页面级数据必须通过 pageContext 传入。

推荐职责：

```text
+Head.vue
  - favicon
  - description
  - canonical
  - Open Graph
  - Twitter Card
  - robots
  - theme-color
```

不建议在 `+Head.vue` 中：

- 查询 D1
- 调用 telefunc
- 请求远程 API
- 读取只存在于客户端的状态
- 通过 `onMounted` 修改 title 或 meta
- 注入未经审核的任意脚本

`+Head.vue` 应保持为纯展示层。

---

## 18. 安全与隐私要求

SEO 标签属于公开 HTML，禁止放入：

- 订单查询 token
- 用户邮箱、手机号或其他联系方式
- 支付回调参数
- 管理员信息
- 库存内部标识
- 任何鉴权 cookie 或 secret

商品描述来自后台输入时，应经过纯文本清洗后再作为 description 或 OG 内容使用。不要把原始富文本 HTML 直接拼接到属性字符串中。

---

## 19. 第二阶段验收标准

### Head 标签

- [x] 首页包含 `description`
- [x] 商品详情页包含动态 `og:title`
- [x] 商品详情页包含动态 `og:description`
- [x] 商品详情页包含 `og:type=product`
- [x] 首页包含 `og:type=website`
- [x] 页面包含正确的 `og:url`
- [x] 页面包含正确的 canonical
- [x] 有商品封面时使用商品封面作为 `og:image`
- [x] 无商品封面时按 fallback 规则选择图片
- [x] Twitter Card 与 OG 数据保持一致
- [x] 后台和订单相关页面使用 `noindex,nofollow,noarchive`

### URL 和图片

- [x] canonical 不包含订单 token 等敏感 query 参数
- [x] OG 图片为绝对 URL
- [x] 图片 URL 经过 HTTPS/HTTP 合法性检查
- [x] siteUrl 末尾斜杠处理统一
- [ ] 反向代理或 CDN 修改 Host 时，不会生成错误的 canonical（待生产代理环境验证外部 origin 传递）

### SSR 和爬虫

使用原始 HTTP 响应检查，而不是只检查 hydration 后 DOM：

```bash
curl -s https://example.com/
curl -s https://example.com/product/example
```

确认服务端响应已经包含：

```html
<title>...</title>
<meta name="description" content="...">
<link rel="canonical" href="...">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta name="twitter:card" content="...">
```

还应使用以下工具检查分享预览：

- Facebook Sharing Debugger
- LinkedIn Post Inspector
- Twitter/X Card Validator（若可用）
- 浏览器查看页面源代码

### 本地 SSR 验证记录

已在本地 D1 临时创建活动分类与带封面商品，并通过 Vike dev server 的原始 HTTP 响应验证：

- `/` 输出 description、canonical、`og:type=website` 与 Twitter Card
- `/product/seo-verification-product` 输出商品 title、商品摘要 description、`og:type=product`、商品 canonical、绝对 `og:image` 与一致的 Twitter 字段
- `/order` 输出 `noindex,nofollow,noarchive`，且不输出公共 canonical

验证完成后必须删除临时分类和商品，避免把测试数据保留在本地或远程 D1。生产环境仍需在真实域名与反向代理/CDN 配置下复验 canonical origin。

---

## 20. 实施顺序

### 第一阶段实施顺序

1. 确认 favicon 是否复用 `logo`；如果不复用，新增 `logoIcon`
2. 新增公共站点设置类型和读取服务
3. 实现 Worker isolate 内存缓存和 60 秒 TTL
4. 实现缓存失效函数
5. 在站点设置保存成功后调用缓存失效
6. 新增根级 `+onBeforeRender.ts`
7. 将裁剪后的 `site` 加入 `passToClient`
8. 新增根级 `+title.ts`、`+description.ts`、`+Head.vue`
9. 首页复用全局站点配置，消除重复查询
10. 为商品详情页增加动态 title/description
11. 检查 SSR 原始 HTML

### 第二阶段实施顺序

1. 增加 SEO 文本清洗工具
2. 增加 canonical URL 规范化工具
3. 扩展 `SeoMeta` 数据模型
4. 在根级 `+Head.vue` 增加 description、canonical、OG、Twitter 标签
5. 为商品详情页设置 product 类型和商品图片
6. 为后台、订单、支付页面设置 noindex
7. 检查绝对 URL、代理域名和 query 参数处理
8. 使用爬虫和社交平台调试工具验证

---

## 21. 最终方案摘要

当前 `cffk` 推荐采用以下方案：

```text
D1 siteSetting
  + Worker isolate 内存缓存
  + 60 秒 TTL
  + 保存配置后主动失效当前 isolate
  + 根级 +onBeforeRender 注入 pageContext.site
  + 根级 +title.ts / +description.ts 提供默认值
  + 根级 +Head.vue 提供 favicon 和 SEO 标签
  + 商品详情页通过 +title.ts / +description.ts 动态覆盖
  + OG/Twitter/canonical 在 SSR 阶段生成
  + 后台、订单、支付页面 noindex
```

该方案保留 Vike 的标准页面元数据能力，避免了 `edgeKey` 当前每次请求查询 D1 和首页重复读取站点配置的问题，同时不引入 KV 或整页缓存带来的复杂性。
