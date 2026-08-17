import { telefuncAction } from "@/server/telefunc-action";

import { siteSetting } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { validateSiteSettingsInput, type SiteSettingsInput } from "@/lib/validators/site";
import { requireAdmin } from "@/server/telefunc-context";
import { getSiteSettings, invalidateSiteSettings } from "./public-settings";

async function internalOnGetSiteSettings() {
  const { database } = requireAdmin();
  return getSiteSettings(database);
}

async function internalOnSaveSiteSettings(input: SiteSettingsInput) {
  const { database, db } = requireAdmin();
  const values = validateSiteSettingsInput(input);
  const now = new Date();
  const [record] = await db
    .insert(siteSetting)
    .values({ id: 1, ...values, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: siteSetting.id, set: { ...values, updatedAt: now } })
    .returning();

  if (!record) appError("SITE_SETTINGS_NOT_FOUND");
  invalidateSiteSettings(database);
  return record;
}

export const onGetSiteSettings = telefuncAction(internalOnGetSiteSettings);
export const onSaveSiteSettings = telefuncAction(internalOnSaveSiteSettings);

