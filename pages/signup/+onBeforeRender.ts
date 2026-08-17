import type { PageContextServer } from "vike/types";
import { eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { adminBootstrap } from "@/database/drizzle/schema";
import { getSiteSettings } from "@/server/site/public-settings";

export async function onBeforeRender(pageContext: PageContextServer) {
  const [root] = await createDrizzleDb(pageContext.env.DB)
    .select({ id: adminBootstrap.id })
    .from(adminBootstrap)
    .where(eq(adminBootstrap.id, 1))
    .limit(1);

  const settings = await getSiteSettings(pageContext.env.DB);
  return {
    pageContext: {
      rootInitialized: Boolean(root),
      registrationEnabled: settings.registrationEnabled,
    },
  };
}
