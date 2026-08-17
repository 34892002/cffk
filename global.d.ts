import type { User } from "better-auth";

declare global {
  const __APP_VERSION__: string;

  namespace Vike {
    interface PageContextServer {
      env: Env;
    }
    interface PageContext {
      // Set by `betterAuthSessionMiddleware`; only `user` is passed to public clients.
      user?: User | null;
      // Server-side authorization state. Never include this in global `passToClient`.
      isAdmin?: boolean;
      rootInitialized?: boolean;
    }
  }
}

export {};
