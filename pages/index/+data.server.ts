import { env } from "cloudflare:workers";
import { getPublicCatalog } from "@/server/catalog/public";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data() {
  return getPublicCatalog(env.DB);
}
