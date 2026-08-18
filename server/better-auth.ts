import { env } from "./env";
import { getTurnstileConfig } from "@/lib/turnstile-config";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { sql } from "drizzle-orm";
import { captcha, twoFactor } from "better-auth/plugins";
import { getDrizzleDb } from "../database/drizzle";
import { schema } from "../database/drizzle/schema";
import { dispatchPush } from "./push/service";
import { getSiteSettings } from "./site/public-settings";

const APP_NAME = "CFFK 发卡";

type AuthRuntimeEnv = Record<string, unknown> & { DB?: D1Database };

type AuthConfigOptions = {
  allowSetupRegistration?: boolean;
};

const REGISTRATION_DISABLED_MESSAGE = "本站还未开启注册功能，如需帮助请联系客服。";
const EMAIL_CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EMAIL_CHANGE_RESEND_INTERVAL_MS = 60 * 1000;

export function getAuthConfig(runtime?: RuntimeAdapter, publicOrigin?: string, options: AuthConfigOptions = {}): BetterAuthOptions {
  const runtimeEnv = (runtime && "env" in runtime ? runtime.env : undefined) as AuthRuntimeEnv | undefined;
  const turnstile = getTurnstileConfig(env);
  const deliverAuthEmail = async (scene: "EMAIL_VERIFICATION" | "PASSWORD_RESET", recipient: string, actionUrl: string) => {
    const database = runtimeEnv?.DB;
    if (!database) {
      console.error("Better Auth email delivery is unavailable");
      return;
    }

    try {
      const [settings] = await getDrizzleDb(runtime)
        .select({ siteName: schema.siteSetting.siteName })
        .from(schema.siteSetting)
        .limit(1);
      const results = await dispatchPush(database, runtimeEnv, {
        scene,
        messageType: "NORMAL",
        variables: { siteName: settings?.siteName || APP_NAME, actionUrl },
        source: `better-auth:${scene.toLowerCase()}:${crypto.randomUUID()}`,
        recipient: { type: "CUSTOMER", address: recipient },
      });
      if (!results.some((result) => result.status === "SUCCESS")) {
        console.error(`Better Auth ${scene.toLowerCase()} email delivery did not succeed`);
      }
    } catch {
      // Do not let uncertain callback error semantics leave setup or sign-up users orphaned.
      console.error(`Better Auth ${scene.toLowerCase()} email delivery failed`);
    }
  };

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
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60,
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await deliverAuthEmail("PASSWORD_RESET", user.email, url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        if (request?.headers.get("x-cffk-admin-create-user") === "1") return;
        await deliverAuthEmail("EMAIL_VERIFICATION", user.email, url);
      },
      afterEmailVerification: async (user) => {
        await getDrizzleDb(runtime).update(schema.user)
          .set({ emailChangeRequestedAt: new Date(), emailChangePendingEmail: null })
          .where(sql`${schema.user.id} = ${user.id} AND ${schema.user.emailChangePendingEmail} = ${user.email}`);
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const database = runtimeEnv?.DB;
        if (ctx.path === "/change-email") {
          if (!database) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Email change settings are unavailable." });

          const userId = ctx.context.session?.user.id;
          const newEmail = typeof ctx.body?.newEmail === "string" ? ctx.body.newEmail.trim().toLowerCase() : "";
          if (!userId) throw new APIError("UNAUTHORIZED", { message: "Authentication is required." });
          if (!newEmail) throw new APIError("BAD_REQUEST", { message: "A new email is required." });

          const requestedAt = new Date();
          const result = await getDrizzleDb(runtime)
            .update(schema.user)
            .set({ emailChangePendingEmail: newEmail, emailChangeLastSentAt: requestedAt })
            .where(sql`${schema.user.id} = ${userId} AND (${schema.user.emailChangeRequestedAt} IS NULL OR ${schema.user.emailChangeRequestedAt} <= ${new Date(requestedAt.getTime() - EMAIL_CHANGE_INTERVAL_MS)}) AND (${schema.user.emailChangeLastSentAt} IS NULL OR ${schema.user.emailChangeLastSentAt} <= ${new Date(requestedAt.getTime() - EMAIL_CHANGE_RESEND_INTERVAL_MS)})`)
            .returning({ id: schema.user.id });
          if (!result.length) throw new APIError("TOO_MANY_REQUESTS", { message: "Email change request rate limit exceeded." });
          return;
        }

        if (ctx.path !== "/sign-up/email" || options.allowSetupRegistration) return;
        if (!database) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Registration settings are unavailable." });

        const settings = await getSiteSettings(database);
        if (!settings.registrationEnabled) {
          throw new APIError("FORBIDDEN", { message: REGISTRATION_DISABLED_MESSAGE });
        }
      }),
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
      },
    },
    appName: APP_NAME,
    plugins: [
      twoFactor({ issuer: "CFFK 发卡" }),
      ...(turnstile.enabled ? [captcha({ provider: "cloudflare-turnstile", secretKey: turnstile.secretKey!, endpoints: ["/sign-in/email"] })] : []),
    ],
  };
}

export function createServerAuth(runtime: RuntimeAdapter, publicOrigin?: string, options?: AuthConfigOptions) {
  return betterAuth(getAuthConfig(runtime, publicOrigin, options));
}
