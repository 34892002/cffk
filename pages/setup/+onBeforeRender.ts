import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { adminBootstrap } from "@/database/drizzle/schema";

export async function onBeforeRender(pageContext: PageContextServer) {
  const [root] = await createDrizzleDb(pageContext.env.DB)
    .select({ id: adminBootstrap.id })
    .from(adminBootstrap)
    .where(eq(adminBootstrap.id, 1))
    .limit(1);

  if (root) throw render(404);
}
