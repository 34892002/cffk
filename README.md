# Vike + Vue + Cloudflare Workers Starter

一个使用 Vike、Vue 3、Hono、Cloudflare Workers、D1、Drizzle ORM、Better Auth 和 shadcn-vue 的全栈脚手架。

## 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/34892002/cffk)

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
npx wrangler d1 migrations list MY_VIKE_DEMO_DATABASE --local
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

开发环境默认值位于 `wrangler.jsonc` 的 `vars`：

```jsonc
{
  "ADMIN_PATH": "admin",
  "BETTER_AUTH_SECRET": "dev-secret-please-change-me-in-production"
}
```

提供的页面：

- `/reg`：注册
- `/${ADMIN_PATH}`：管理员登录
- `/${ADMIN_PATH}/dash`：受登录保护的后台主页


## 部署到 Cloudflare Workers

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 创建远程 D1 数据库

```bash
npx wrangler d1 create MY_VIKE_DEMO_DATABASE
```

命令会返回数据库 UUID。将 `wrangler.jsonc` 中的 D1 配置更新为真实值：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "MY_VIKE_DEMO_DATABASE",
      "database_id": "<创建命令返回的 UUID>",
      "migrations_dir": "database/migrations"
    }
  ]
}
```

如需更换数据库名称，同时更新 `wrangler.jsonc` 与 `package.json` 中 `db:migrate:local`、`db:migrate:remote` 脚本的数据库名称。

修改 `wrangler.jsonc` 后重新生成 Workers 类型：

```bash
npm run generate-types
```

### 3. 配置生产认证变量

部署后，`ADMIN_PATH` 使用 `wrangler.jsonc` 的值；本地 `.dev.vars` 可覆盖它。生产环境请改为不可预测的路径段。后台“网站地址”是认证、支付回调和 SEO 的统一公开地址；未设置时会使用当前请求地址。不要在生产环境保留默认开发密钥；使用 Wrangler Secret 设置强随机密钥：

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```

然后从 `wrangler.jsonc` 的 `vars` 中移除 `BETTER_AUTH_SECRET`，避免普通配置覆盖该 secret。

### 4. 应用远程数据库迁移

先检查并提交需要的 migration，然后运行：

```bash
npm run db:migrate:remote
```

该命令会连接 Cloudflare 上的 D1。执行前请确认 `wrangler.jsonc` 中的数据库配置和 migration SQL 均正确。

### 5. 构建并部署

```bash
npm run deploy
```

该命令会执行 `vike build`，然后执行 `wrangler deploy`。

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
