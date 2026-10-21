import type { PageContext } from "vike/types";
import { resolveHeadersLocale } from "@/lib/i18n/locale";

/**
 * Resolves the interface language before routing so every server render,
 * including 404/500 pages, already knows its locale. Client-side navigation has
 * no request headers; there the value is kept or refreshed by `+onBeforeRender`.
 */
export function onBeforeRoute(pageContext: PageContext) {
  const headers = (pageContext as PageContext & { headers?: Record<string, string | undefined> }).headers;
  if (!headers) return;
  return { pageContext: { locale: resolveHeadersLocale(headers) } };
}
