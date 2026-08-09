# Vike + Vue + Cloudflare Workers Starter

一个使用 Vike、Vue 3、Hono、Cloudflare Workers、D1、Drizzle ORM、Better Auth 和 shadcn-vue 的全栈脚手架。

## 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/34892002/cffk)

部署页面会收集两项配置：

- `ADMIN_PATH`：普通变量，会显示为一个可编辑的明文输入框，用于设置后台路径段。
- `BETTER_AUTH_SECRET`：Secret，会显示为掩码输入框，用于签名登录会话。可使用 `openssl rand -base64 32` 生成。

## 技术栈

- **Web**：Vike、Vue 3、Vite、Tailwind CSS、shadcn-vue
- **服务端**：Hono，运行于 Cloudflare Workers
- **数据库**：Cloudflare D1 + Drizzle ORM
- **认证**：Better Auth（邮箱密码登录）

## 环境要求

- Node.js 20 或更高版本
- npm
- Cloudflare 账号（仅部署远程 Workers / D1 时需要）

## 安装与本地调试

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认访问地址为 <http://localhost:3000>。

开发模式使用 Wrangler 的本地 D1 模拟数据库。首次启动前请先初始化本地数据库（下一节）。

常用检查命令：

```bash
npm run lint
npm run db:check
npm run build
```

## 初始化本地 D1 数据库

数据库 schema 位于 `database/drizzle/schema.ts`，生成的 SQL migration 位于 `database/migrations/`。

对于一个全新的本地环境，执行：

```bash
# 仅在 schema 变更后需要：根据 schema 生成新的 SQL migration
npm run db:generate

# 将全部 migration 应用到 Wrangler 的本地 D1 数据库
npm run db:migrate:local
```

`db:generate` **不会创建或修改数据库**，它只生成 migration 文件；真正创建表的是 `db:migrate:local`。

可用下面的命令确认 migration 状态：

```bash
npx wrangler d1 migrations list DB --local
```

该脚手架初始化后会创建 Better Auth 所需的四张表：`user`、`session`、`account` 和 `verification`。

### 重置本地数据库

本地 D1 的状态保存在 `.wrangler/state/`，不会影响远程 D1。需要完全重新初始化时：

```bash
# Windows PowerShell
Remove-Item -Recurse -Force .wrangler/state

# macOS / Linux / Git Bash
rm -rf .wrangler/state

# 使用现有 migrations 重建本地数据库
npm run db:migrate:local
```

通常不应删除已经提交的 migration 文件。只有在这个脚手架尚未被其他人使用、且希望从 schema 重新建立初始 migration 时，才删除 `database/migrations/` 中的 migration 和 `meta/` 后重新执行 `npm run db:generate`。

## 后续数据库迁移

修改 `database/drizzle/schema.ts` 后：

```bash
# 1. 生成新的 migration；提交生成的 SQL 与 meta 文件
npm run db:generate

# 2. 本地验证 migration
npm run db:migrate:local
npm run db:check

# 3. 导入seed
npm run db:seed:local
```

生成后请先阅读 `database/migrations/*.sql`，确认 SQL 符合预期。不要编辑已应用到共享数据库的 migration；应新建一份 migration 来演进 schema。

## Better Auth 配置

`ADMIN_PATH` 是 `wrangler.jsonc` 中的普通变量；`BETTER_AUTH_SECRET` 是 Secret。为本地开发创建未提交的 `.dev.vars`，填入：

```ini
ADMIN_PATH=admin
BETTER_AUTH_SECRET=local-development-secret
```

提供的页面：

- `/setup`：初始化管理员账号
- `/${ADMIN_PATH}`：管理员登录
- `/${ADMIN_PATH}/dash`：受登录保护的后台主页


## 部署到 Cloudflare Workers

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 创建远程 D1 数据库

```bash
npx wrangler d1 create cffk_db
```

命令会返回数据库 UUID。将 `wrangler.jsonc` 中的 D1 配置更新为真实值：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cffk_db",
      "database_id": "<创建命令返回的 UUID>",
      "migrations_dir": "database/migrations"
    }
  ]
}
```

迁移与导入脚本使用 D1 绑定名 `DB`，因此一键部署时可以修改数据库名称而无需修改 `package.json`。

修改 `wrangler.jsonc` 后重新生成 Workers 类型：

```bash
npm run generate-types
```

### 3. 配置生产认证变量

一键部署时，部署按钮会将 `ADMIN_PATH` 作为普通变量、`BETTER_AUTH_SECRET` 作为 Secret 收集。生产环境请为后台路径使用不可预测的值。后台“网站地址”是认证、支付回调和 SEO 的统一公开地址；未设置时会使用当前请求地址。

手动部署时，使用 Wrangler 设置强随机密钥：

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```

### 4. 配置邮件 Provider

后台进入 `/${ADMIN_PATH}/push/email/post-office`，点击“新增邮局”即可配置邮件发送方式。支持三类 Provider：

- `API`：Brevo 或 Resend。填写发件邮箱、API 地址，并填写 API Key 对应的 Worker Secret 名称。
- `SMTP`：填写 SMTP Host、端口、用户名，并填写密码对应的 Worker Secret 名称。
- `Cloudflare`：填写 Email Sending Binding 名称和发件邮箱。

密钥原文不能写入 D1 配置或代码仓库。先设置 Worker Secret，例如：

```bash
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SMTP_PASSWORD
```

页面中的 Secret 名称必须与实际 Secret 名称一致。配置保存后，在邮局列表中点击“测试”验证指定 Provider；点击“启用”后该邮件 Provider 才会用于业务通知，同一时间只会启用一个邮件 Provider。

邮件模板在 `/${ADMIN_PATH}/push/email/templates` 配置，业务发送策略在 `/${ADMIN_PATH}/push/config` 配置，投递结果在 `/${ADMIN_PATH}/push/history` 查看。

### 5. 配置媒体存储

后台进入 `/${ADMIN_PATH}/system/media`，点击“存储配置”填写 S3 兼容端点、bucket、region、路径前缀、缓存策略、Access Key ID 和 Secret Access Key。访问密钥保存在 D1，仅由 Worker 服务端读取；配置读取接口只返回是否已配置，不会将原始凭据返回浏览器。更新凭据保存后立即生效，无需重新部署 Worker。请勿将凭据提交到仓库或写入 `.dev.vars`。

媒体库仅支持 JPEG、PNG、GIF、WebP 与 PDF；图片最大 10 MiB，PDF 最大 20 MiB。所有公开 URL 均为站内 `/media/proxy/*`，由 Worker 读取对象并使用 `caches.default` 缓存；删除会清理当前 PoP 缓存，但其他 PoP 可能会在 immutable TTL 内继续提供旧对象。

配置保存后使用“测试连接”验证 PUT、读取和 DELETE 权限。不要为此授予 ListObjects 权限。

### 6. 应用远程数据库迁移

先检查并提交需要的 migration，然后运行：

```bash
npm run db:migrate:remote
```

该命令会连接 Cloudflare 上的 D1。执行前请确认 `wrangler.jsonc` 中的数据库配置和 migration SQL 均正确。

### 7. 构建并部署

```bash
npm run deploy
```

该命令会执行 `vike build`，然后执行 `wrangler deploy`。

## 定时任务

Worker 通过 `wrangler.jsonc` 的 Cron Trigger 每 5 分钟运行一次维护任务。系统会自动关闭创建超过 30 分钟且仍为 `PENDING`、`UNPAID` 的订单，释放已锁定卡密、恢复实物库存和优惠码占用，并写入 `AUTO_CLOSE` 支付日志。关闭后的订单不接受延迟支付回调。

## 邮件配置排查

- 页面没有任何邮局：执行 `npm run db:seed:local` 或 `npm run db:seed:remote` 初始化默认 API、SMTP 和 Cloudflare 配置。
- Provider 显示已启用但发送失败：检查对应 Worker Secret 是否存在、Secret 名称是否拼写一致，以及发件域名是否已在服务商处验证。
- Cloudflare 邮件发送失败：检查 `wrangler.jsonc` 中的 Email Sending Binding 名称是否与页面中的 Binding 一致。
- 业务没有发送记录：检查 `/push/config` 的全局开关、消息策略和 `/push/email/templates` 中对应场景模板是否启用。

## 项目命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run build` | 构建生产产物 |
| `npm run preview` | 构建并本地预览生产产物 |
| `npm run db:generate` | 从 Drizzle schema 生成 SQL migration |
| `npm run db:check` | 检查 Drizzle migration 完整性 |
| `npm run db:migrate:local` | 应用 migration 到本地 D1 |
| `npm run db:migrate:remote` | 应用 migration 到远程 D1 |
| `npm run generate-types` | 从 Wrangler 配置生成 Workers 类型 |
| `npm run deploy` | 构建并部署到 Cloudflare Workers |
