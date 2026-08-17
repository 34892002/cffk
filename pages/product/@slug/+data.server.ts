import { render } from "vike/abort";
import { env } from "cloudflare:workers";
import { getPublicProductDetail } from "@/server/catalog/public";
import { getEnabledPaymentProviders } from "@/server/payment/config";
import { withServerDataErrorHandling } from "@/server/error-handling";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { routeParams: { slug: string } }) {
  return withServerDataErrorHandling("page data: product", pageContext, async () => {
    const product = await getPublicProductDetail(env.DB, pageContext.routeParams.slug);
    if (!product) throw render(404);
    const paymentProviders = await getEnabledPaymentProviders(env.DB);
    return { ...product, paymentProviders };
  });
}
