import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export function guard(pageContext: PageContextServer) {
  if (!pageContext.user) throw redirect("/login");
}
