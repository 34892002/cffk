import { env } from "./env";
import type { RuntimeAdapter } from "@universal-middleware/core";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { username } from "better-auth/plugins";
import { getDrizzleDb } from "../database/drizzle";
import { schema } from "../database/drizzle/schema";


export function getAuthConfig(runtime?: RuntimeAdapter, publicOrigin?: string): BetterAuthOptions {
  return {
    secret: env.BETTER_AUTH_SECRET,
    ...(publicOrigin ? { baseURL: publicOrigin } : {}),
    database: drizzleAdapter(getDrizzleDb(runtime), {
      provider: "sqlite",
      schema: {
        ...schema,
        user: schema.user,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      changeEmail: {
        enabled: true,
        // 本地项目暂无邮件验证投递能力；邮箱修改由当前登录会话直接提交。
        updateEmailWithoutVerification: true,
      },
    },
    // `user.username` is the unique administrator sign-in identifier, matching
    // EdgeKey's Admin.username behavior while Better Auth owns credentials.
    plugins: [username()],
    disabledPaths: ["/is-username-available"],
  };
}
