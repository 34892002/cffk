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
    baseURL: publicOrigin ?? env.BETTER_AUTH_URL,
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
    // `user.username` is the unique administrator sign-in identifier, matching
    // EdgeKey's Admin.username behavior while Better Auth owns credentials.
    plugins: [username()],
    disabledPaths: ["/is-username-available"],
    // GitHub is only enabled once its credentials are set, so the app runs out of the box without them.
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {},
  };
}
