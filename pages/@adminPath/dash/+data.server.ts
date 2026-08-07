import { env } from "cloudflare:workers";
import { getDashboardData } from "@/server/dashboard/metrics";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data() {
  return getDashboardData(env.DB);
}
