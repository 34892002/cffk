/* eslint-disable no-undef -- 该脚本以 Node 运行，不在 ESLint 的 node 全局环境配置里。 */
/**
 * 在 Cloudflare Workers Builds 的构建阶段，把未应用的 D1 迁移打到远程数据库上。
 *
 * 背景：Cloudflare 的自动构建默认只执行 `bun run build` 与 `npx wrangler deploy`，
 * 这两步都不会建表，而本项目所有表结构都来自 database/migrations/*.sql。把本脚本挂到
 * build 脚本上（package.json → scripts.build → db:migrate:ci）之后，每次推送触发的
 * 构建都会先应用迁移，再部署 Worker。
 *
 * 行为：
 * - 只在 Workers Builds 环境执行；本地 `bun run build` 会跳过（本地请用 `bun run db:migrate:remote`）。
 * - 只在生产分支执行，避免分支预览构建改动生产库（可用 CFFK_PROD_BRANCH 覆盖，默认 main）。
 * - 设置 CFFK_SKIP_CI_MIGRATE=1 可整体跳过。
 * - 认证/权限/环境类失败只告警、不阻断部署；迁移本身失败（SQL 错误等）会让构建失败。
 */
import { spawn } from "node:child_process";

const PREFIX = "[ci-migrate]";
const log = (message) => console.log(`${PREFIX} ${message}`);
const warn = (message) => console.warn(`${PREFIX} ⚠️  ${message}`);

const inWorkersBuilds =
  process.env.WORKERS_CI === "1" || Boolean(process.env.WORKERS_CI_BUILD_UUID);

if (!inWorkersBuilds) {
  log("非 Workers Builds 环境，跳过远程迁移");
  process.exit(0);
}

if (process.env.CFFK_SKIP_CI_MIGRATE === "1") {
  log("CFFK_SKIP_CI_MIGRATE=1，跳过远程迁移");
  process.exit(0);
}

const branch = process.env.WORKERS_CI_BRANCH ?? "";
const productionBranch = process.env.CFFK_PROD_BRANCH ?? "main";

if (branch && branch !== productionBranch) {
  log(`分支 ${branch} 不是生产分支 ${productionBranch}，跳过远程迁移`);
  process.exit(0);
}

const binding = process.env.CFFK_D1_BINDING ?? "DB";

log(`Workers Builds 环境（分支 ${branch || "未知"}），开始应用绑定 ${binding} 的远程迁移`);

let finished = false;
const finish = (code) => {
  if (finished) return;
  finished = true;
  process.exit(code);
};

const child = spawn("wrangler", ["d1", "migrations", "apply", binding, "--remote"], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: process.platform === "win32",
});

let output = "";
const forward = (stream, target) => {
  stream.on("data", (chunk) => {
    output += chunk.toString();
    target.write(chunk);
  });
};

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

child.on("error", (error) => {
  warn(`无法执行 wrangler：${error.message}`);
  warn(
    "请确认构建环境安装了 devDependencies（wrangler 位于 devDependencies），或在 Cloudflare 控制台把 Deploy command 设为 `bun run deploy`。",
  );
  finish(0);
});

child.on("close", (code) => {
  if (code === 0) {
    log("远程迁移已应用");
    finish(0);
    return;
  }

  const environmentProblem =
    /Authentication error|code: 10000|not authorized|unauthorized|forbidden|permission|non-interactive environment|CLOUDFLARE_API_TOKEN|not logged in/i.test(
      output,
    );

  if (environmentProblem) {
    warn("Cloudflare API 拒绝了本次迁移请求（认证或权限问题）。");
    warn(
      "通常是 Workers Builds 使用的 API Token 没有 D1 权限：在 Worker 的 Settings → Build → API token 中选择一个带 Account → D1 → Edit 的 token，然后重试构建。",
    );
    warn("本次构建继续执行，但数据库结构可能仍与代码不一致。");
    finish(0);
    return;
  }

  console.error(
    `${PREFIX} ❌ 迁移失败（wrangler 退出码 ${code}），已中断构建，避免 Worker 与数据库结构不一致。`,
  );
  finish(1);
});
