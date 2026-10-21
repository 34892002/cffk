import { env } from "cloudflare:workers";
import { getPublicCatalog } from "@/server/catalog/public";
import { withServerDataErrorHandling } from "@/server/error-handling";
import { defaultStorefrontLocale, isStorefrontLocale } from "@/lib/i18n/locale";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { locale?: string }) {
  const locale = isStorefrontLocale(pageContext.locale) ? pageContext.locale : defaultStorefrontLocale;
  return withServerDataErrorHandling("page data: index", {}, () => getPublicCatalog(env.DB, locale));
}
