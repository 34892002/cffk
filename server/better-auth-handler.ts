import {
  enhance,
  type RuntimeAdapter,
  type UniversalHandler,
  type UniversalMiddleware,
} from "@universal-middleware/core";
import { betterAuth } from "better-auth";
import { getAuthConfig } from "./better-auth";
import { resolveAuthOrigin, rewriteRequestOrigin, withAuthNoStore } from "./auth-origin";
import { eq, sql } from "drizzle-orm";
import { schema } from "../database/drizzle/schema";
import { getDrizzleDb } from "../database/drizzle";
import { hasRoot } from "./admin";

// On Cloudflare the D1 binding is request-scoped (fresh instance per request); elsewhere it's memoized.
function getAuth(runtime: RuntimeAdapter, publicOrigin?: string) {
  return betterAuth(getAuthConfig(runtime, publicOrigin));
}

// Note: You can directly define a server middleware instead of defining a Universal Middleware. (You can remove @universal-middleware/* — Vike's scaffolder uses it only to simplify its internal logic, see https://github.com/vikejs/vike/discussions/3116)
/**
 * Add the Better Auth user to the context.
 * @link {@see https://better-auth.com/docs/concepts/session-management}
 */
export async function getRequestSession(request: Request, runtime: RuntimeAdapter) {
  const publicOrigin = await resolveAuthOrigin(request, runtime);
  const authRequest = rewriteRequestOrigin(request, publicOrigin);
  return getAuth(runtime, publicOrigin).api.getSession({ headers: authRequest.headers });
}

export const betterAuthSessionMiddleware: UniversalMiddleware = enhance(
  // The context we add here is automatically merged into pageContext
  async (request, context, runtime) => {
    if (!request.headers.get("cookie")) {
      return {
        ...context,
        user: null,
        isAdmin: false,
      };
    }

    try {
      const data = await getRequestSession(request, runtime);
      const userId = data?.user?.id;
      const [account] = userId
        ? await getDrizzleDb(runtime)
            .select({
              disabledAt: schema.user.disabledAt,
              rootUserId: schema.adminBootstrap.userId,
            })
            .from(schema.user)
            .leftJoin(schema.adminBootstrap, eq(schema.adminBootstrap.userId, schema.user.id))
            .where(eq(schema.user.id, userId))
            .limit(1)
        : [];
      const isDisabled = Boolean(account?.disabledAt);
      return {
        ...context,
        // Disabled accounts are treated as signed out, including existing sessions.
        user: isDisabled ? null : data?.user ?? null,
        isAdmin: !isDisabled && account?.rootUserId === userId,
      };
    } catch (error) {
      console.debug("betterAuthSessionMiddleware:", error);
      return {
        ...context,
        user: null,
        isAdmin: false,
      };
    }
  },
  {
    name: "my-app:better-auth-middleware",
    immutable: false,
  },
);

// Note: You can directly define a server middleware instead of defining a Universal Middleware. (You can remove @universal-middleware/* — Vike's scaffolder uses it only to simplify its internal logic, see https://github.com/vikejs/vike/discussions/3116)
/**
 * Better Auth route
 * @link {@see https://better-auth.com/docs/installation}
 **/
export const betterAuthHandler = enhance(
  async (request, _context, runtime) => {
    const publicOrigin = await resolveAuthOrigin(request, runtime);
    const authRequest = rewriteRequestOrigin(request, publicOrigin);
    const authPath = new URL(authRequest.url).pathname;
    const isEmailSignUp = authRequest.method === "POST" && authPath.endsWith("/sign-up/email");

    if (isEmailSignUp && !(await hasRoot(runtime))) {
      return withAuthNoStore(Response.json(
        { code: "SIGN_UP_UNAVAILABLE", message: "Sign-up is currently unavailable." },
        { status: 503 },
      ));
    }

    if (authRequest.method === "POST" && authPath.endsWith("/sign-in/email")) {
      const body = await authRequest.clone().json().catch(() => null) as { email?: unknown } | null;
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const isAdminLogin = authRequest.headers.get("x-cffk-admin-login") === "1";
      if (email) {
        const [account] = await getDrizzleDb(runtime)
          .select({ disabledAt: schema.user.disabledAt, rootUserId: schema.adminBootstrap.userId })
          .from(schema.user)
          .leftJoin(schema.adminBootstrap, eq(schema.adminBootstrap.userId, schema.user.id))
          .where(sql`lower(${schema.user.email}) = ${email}`)
          .limit(1);
        if (isAdminLogin && (!account || account.disabledAt || !account.rootUserId)) {
          return withAuthNoStore(Response.json(
            { code: "INVALID_ADMIN_CREDENTIALS", message: "Invalid credentials." },
            { status: 401 },
          ));
        }
        if (!isAdminLogin && account?.rootUserId) {
          return withAuthNoStore(Response.json(
            { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
            { status: 401 },
          ));
        }
        if (account?.disabledAt) {
          return withAuthNoStore(Response.json({ code: "ACCOUNT_DISABLED", message: "Account is disabled." }, { status: 403 }));
        }
      }
    }

    return withAuthNoStore(await getAuth(runtime, publicOrigin).handler(authRequest));
  },
  {
    name: "my-app:better-auth-handler",
    path: "/api/auth/**",
    method: ["GET", "POST"],
    immutable: false,
  },
) satisfies UniversalHandler;
