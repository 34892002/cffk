import {
  enhance,
  type RuntimeAdapter,
  type UniversalHandler,
  type UniversalMiddleware,
} from "@universal-middleware/core";
import { betterAuth } from "better-auth";
import { getAuthConfig } from "./better-auth";
import { getPublicAuthOrigin, rewriteRequestOrigin, withAuthNoStore } from "./auth-origin";
import { bootstrapFirstAdmin, isActiveAdmin } from "./admin";

// On Cloudflare the D1 binding is request-scoped (fresh instance per request); elsewhere it's memoized.
function getAuth(runtime: RuntimeAdapter, publicOrigin?: string) {
  return betterAuth(getAuthConfig(runtime, publicOrigin));
}

// Note: You can directly define a server middleware instead of defining a Universal Middleware. (You can remove @universal-middleware/* — Vike's scaffolder uses it only to simplify its internal logic, see https://github.com/vikejs/vike/discussions/3116)
/**
 * Add the Better Auth user to the context.
 * @link {@see https://better-auth.com/docs/concepts/session-management}
 */
export const betterAuthSessionMiddleware: UniversalMiddleware = enhance(
  // The context we add here is automatically merged into pageContext
  async (request, context, runtime) => {
    try {
      const publicOrigin = await getPublicAuthOrigin(runtime);
      const authRequest = publicOrigin ? rewriteRequestOrigin(request, publicOrigin) : request;
      const data = await getAuth(runtime, publicOrigin).api.getSession({ headers: authRequest.headers });
      return {
        ...context,
        // Sets pageContext.user and keeps authorization separate from identity.
        user: data?.user ?? null,
        isAdmin: await isActiveAdmin(runtime, data?.user?.id),
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
    const publicOrigin = await getPublicAuthOrigin(runtime);
    const authRequest = publicOrigin ? rewriteRequestOrigin(request, publicOrigin) : request;
    const response = await getAuth(runtime, publicOrigin).handler(authRequest);

    // Better Auth creates the user before returning sign-up. A singleton insert
    // elects exactly one first user as the administrator without trusting input.
    if (authRequest.method === "POST" && new URL(authRequest.url).pathname.endsWith("/sign-up/email") && response.ok) {
      try {
        const payload = await response.clone().json() as { user?: { id?: string } };
        if (payload.user?.id) await bootstrapFirstAdmin(runtime, payload.user.id);
      } catch (error) {
        console.error("first-admin bootstrap failed", error);
      }
    }

    return withAuthNoStore(response);
  },
  {
    name: "my-app:better-auth-handler",
    path: "/api/auth/**",
    method: ["GET", "POST"],
    immutable: false,
  },
) satisfies UniversalHandler;
