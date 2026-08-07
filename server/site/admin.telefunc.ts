
import { siteSetting } from "@/database/drizzle/schema";
import { validateSiteSettingsInput, type SiteSettingsInput } from "@/lib/validators/site";
import { requireAdmin } from "@/server/telefunc-context";
import { getSiteSettings, invalidateSiteSettings } from "./public-settings";

export async function onGetSiteSettings() {
  const { database } = requireAdmin();
  return getSiteSettings(database);
}

export async function onSaveSiteSettings(input: SiteSettingsInput) {
  const { database, db } = requireAdmin();
  const values = validateSiteSettingsInput(input);
  const now = new Date();
  const [record] = await db
    .insert(siteSetting)
    .values({ id: 1, ...values, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: siteSetting.id, set: { ...values, updatedAt: now } })
    .returning();

  if (!record) throw new Error("SITE_SETTINGS_NOT_FOUND");
  invalidateSiteSettings(database);
  return record;
}

