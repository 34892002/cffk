import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";

export function guard(pageContext: PageContextServer) {
  if (!pageContext.user) throw redirect("/login");
  if (pageContext.isAdmin && env.ADMIN_PATH) throw redirect(`/${env.ADMIN_PATH}/dash`);
  throw redirect("/");
}
