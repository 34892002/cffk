import type { PageContextServer } from "vike/types";
import { eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { adminBootstrap } from "@/database/drizzle/schema";

export async function onBeforeRender(_pageContext: PageContextServer) {
  const [root] = await createDrizzleDb(_pageContext.env.DB)
    .select({ id: adminBootstrap.id })
    .from(adminBootstrap)
    .where(eq(adminBootstrap.id, 1))
    .limit(1);

  if (root) throw { is404: true };
}
