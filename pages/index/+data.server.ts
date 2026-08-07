import { env } from "cloudflare:workers";
import { getPublicCatalog } from "@/server/catalog/public";
import { withServerDataErrorHandling } from "@/server/error-handling";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data() {
  return withServerDataErrorHandling("page data: index", {}, () => getPublicCatalog(env.DB));
}
