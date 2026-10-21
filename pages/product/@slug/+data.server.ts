import { render } from "vike/abort";
import { env } from "cloudflare:workers";
import { getPublicProductDetail } from "@/server/catalog/public";
import { getEnabledPaymentProviders } from "@/server/payment/config";
import { withServerDataErrorHandling } from "@/server/error-handling";
import { defaultStorefrontLocale, isStorefrontLocale } from "@/lib/i18n/locale";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { routeParams: { slug: string }; locale?: string }) {
  return withServerDataErrorHandling("page data: product", pageContext, async () => {
    const locale = isStorefrontLocale(pageContext.locale) ? pageContext.locale : defaultStorefrontLocale;
    const product = await getPublicProductDetail(env.DB, pageContext.routeParams.slug, locale);
    if (!product) throw render(404);
    const paymentProviders = await getEnabledPaymentProviders(env.DB);
    return { ...product, paymentProviders };
  });
}
