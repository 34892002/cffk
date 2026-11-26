import { env } from "./env";
import { getTurnstileConfig } from "@/lib/turnstile-config";
import type { StorefrontLocale } from "@/lib/i18n/locale";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import { captcha, twoFactor } from "better-auth/plugins";
import { getDrizzleDb } from "../database/drizzle";
import { schema } from "../database/drizzle/schema";
import { dispatchPush } from "./push/service";
import { allowPasswordResetRequest } from "./auth/reset-rate-limit";
import { getSiteSettings } from "./site/public-settings";

const APP_NAME = "CFFK 发卡";

type AuthRuntimeEnv = Record<string, unknown> & { DB?: D1Database };

type AuthConfigOptions = {
  allowSetupRegistration?: boolean;
  locale?: StorefrontLocale;
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

    // Never build auth email links from the request Host. Until the admin saves
    // a site URL there is no trusted origin, so refuse to send (setup has no
    // visitor-facing email link and skips this guard).
    if (!publicOrigin) {
      if (options.allowSetupRegistration) return;
      throw new APIError("SERVICE_UNAVAILABLE", {
        code: "SITE_URL_REQUIRED",
        message: "Set the site URL in system settings before using email authentication.",
      });
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
        ...(options.locale ? { locale: options.locale } : {}),
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
    // Runs after credentials are verified, so anonymous probes cannot use the
    // response to enumerate disabled accounts. Better Auth has already returned
    // the same generic error for unknown emails and wrong passwords by then.
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [account] = await getDrizzleDb(runtime)
              .select({ disabledAt: schema.user.disabledAt })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1);
            if (account?.disabledAt) {
              throw new APIError("FORBIDDEN", { code: "ACCOUNT_DISABLED", message: "Account is disabled." });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const database = runtimeEnv?.DB;
        if (ctx.request?.method === "POST" && ctx.path === "/request-password-reset") {
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
          if (email && database && !(await allowPasswordResetRequest(database, email))) {
            // 429 is safe against account enumeration here: the counter is keyed
            // on the submitted address and increments whether or not it exists.
            return Response.json({ code: "PASSWORD_RESET_RATE_LIMITED", message: "Too many password reset requests" }, { status: 429 });
          }
          return;
        }

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
      ...(turnstile.enabled ? [captcha({ provider: "cloudflare-turnstile", secretKey: turnstile.secretKey!, endpoints: ["/sign-in/email", "/sign-up/email", "/request-password-reset", "/change-email", "/send-verification-email"] })] : []),
    ],
  };
}

export function createServerAuth(runtime: RuntimeAdapter, publicOrigin?: string, options?: AuthConfigOptions) {
  return betterAuth(getAuthConfig(runtime, publicOrigin, options));
}
