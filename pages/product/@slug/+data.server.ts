import { render } from "vike/abort";
import { env } from "cloudflare:workers";
import { getPublicProductDetail } from "@/server/catalog/public";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { routeParams: { slug: string } }) {
  const product = await getPublicProductDetail(env.DB, pageContext.routeParams.slug);
  if (!product) throw render(404);
  return product;
}
