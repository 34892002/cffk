import { redirect, render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";

export function guard(pageContext: PageContextServer) {
  const adminPath = env.ADMIN_PATH;

  if (!adminPath || pageContext.routeParams.adminPath !== adminPath) {
    throw render(404);
  }

  const loginPath = `/${adminPath}`;
  const pathname = pageContext.urlPathname.replace(/\/$/, "");
  if (pathname === loginPath) return;

  if (!pageContext.user) {
    throw redirect(loginPath);
  }

  if (!pageContext.isAdmin) {
    throw redirect(`${loginPath}?error=ADMIN_ACCESS_REQUIRED`);
  }
}
