import type { PageContext } from "vike/types";

/**
 * `<html lang>` for the storefront. Admin and setup pages stay Chinese so the
 * document language matches their untranslated UI.
 */
export default function lang(pageContext: PageContext) {
  const pathname = pageContext.urlPathname ?? "/";
  if (pageContext.routeParams?.adminPath || pathname === "/setup") return "zh-CN";
  return (pageContext as PageContext & { locale?: string }).locale ?? "zh-CN";
}
