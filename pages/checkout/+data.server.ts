import { render } from "vike/abort";
import { env } from "cloudflare:workers";
import { getPublicProductDetail } from "@/server/catalog/public";
import { getEnabledPaymentProviders } from "@/server/payment/config";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { urlParsed: { search: Record<string, string | string[] | undefined> } }) {
  const slugValue = pageContext.urlParsed.search.product;
  const slug = typeof slugValue === "string" ? slugValue : "";
  const product = await getPublicProductDetail(env.DB, slug);
  if (!product) throw render(404);

  const paymentProviders = await getEnabledPaymentProviders(env.DB);
  return { ...product, paymentProviders };
}
