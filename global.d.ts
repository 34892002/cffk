import type { User } from "better-auth";
declare global {
  namespace Vike {
    interface PageContextServer {
      env: Env;
    }
    interface PageContext {
      // Set by `betterAuthSessionMiddleware`, then passed to the client via `passToClient`.
      user?: User | null;
      isAdmin?: boolean;
    }
  }
}

export {};
