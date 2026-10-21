import { env } from "cloudflare:workers";
import { getPublicCatalog } from "@/server/catalog/public";
import { withServerDataErrorHandling } from "@/server/error-handling";
import { isStorefrontLocale, resolveHeadersLocale } from "@/lib/i18n/locale";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { locale?: string; headers?: Record<string, string | undefined> }) {
  // `+data` runs before `+onBeforeRender`; resolve the locale here so the
  // payload never depends on a previously computed pageContext value.
  const locale = isStorefrontLocale(pageContext.locale) ? pageContext.locale : resolveHeadersLocale(pageContext.headers);
  return withServerDataErrorHandling("page data: index", {}, () => getPublicCatalog(env.DB, locale));
}
