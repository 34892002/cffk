import { redirect, render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";
import { reportUnexpectedServerError } from "@/server/error-handling";

export function guard(pageContext: PageContextServer) {
  try {
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
  } catch (cause) {
    reportUnexpectedServerError("admin page guard", cause, {
      page: {
        urlPathname: pageContext.urlPathname,
        urlOriginal: pageContext.urlOriginal,
        routeParams: pageContext.routeParams,
      },
    });
    throw cause;
  }
}
