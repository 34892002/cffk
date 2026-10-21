import { and, eq } from "drizzle-orm";
import { telefuncAction } from "@/server/telefunc-action";

import { pushChannelConfig, siteSetting } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { validateSiteSettingsInput, type SiteSettingsInput } from "@/lib/validators/site";
import { SITE_TRANSLATION_FIELDS, normalizeContentTranslations, readContentTranslations, serializeContentTranslations, type ContentTranslationLocale, type ContentTranslations } from "@/lib/content-translations";
import { requireAdmin } from "@/server/telefunc-context";
import { getSiteSettings, invalidateSiteSettings } from "./public-settings";

async function internalOnGetSiteSettings() {
  const { database } = requireAdmin();
  const record = await getSiteSettings(database);
  const { translationsJson, ...settings } = record;
  return { ...settings, translations: readContentTranslations(translationsJson, SITE_TRANSLATION_FIELDS) };
}

function normalizeSiteTranslations(input: unknown) {
  const translations = normalizeContentTranslations(input, SITE_TRANSLATION_FIELDS);
  const values: ContentTranslations = {};
  for (const [locale, content] of Object.entries(translations)) {
    if (!content) continue;
    if ((content.subtitle?.length ?? 0) > 300) appError("SITE_SUBTITLE_TOO_LONG");
    if ((content.notice?.length ?? 0) > 2_000) appError("SITE_NOTICE_TOO_LONG");
    if ((content.footerText?.length ?? 0) > 1_000) appError("SITE_FOOTER_TEXT_TOO_LONG");
    if ((content.orderNotice?.length ?? 0) > 2_000) appError("SITE_ORDER_NOTICE_TOO_LONG");
    if ((content.supportContact?.length ?? 0) > 2_000) appError("SITE_SUPPORT_CONTACT_TOO_LONG");
    values[locale as ContentTranslationLocale] = content;
  }
  return values;
}

async function internalOnSaveSiteSettings(input: SiteSettingsInput) {
  const { database, db } = requireAdmin();
  const values = validateSiteSettingsInput(input);
  if (values.registrationEnabled) {
    const [smtpProvider] = await db
      .select({ provider: pushChannelConfig.provider, configJson: pushChannelConfig.configJson })
      .from(pushChannelConfig)
      .where(and(eq(pushChannelConfig.channel, "EMAIL"), eq(pushChannelConfig.provider, "SMTP"), eq(pushChannelConfig.isEnabled, true)))
      .limit(1);
    if (!smtpProvider) appError("REGISTRATION_SMTP_REQUIRED");
  }
  const now = new Date();
  const translationsJson = serializeContentTranslations(normalizeSiteTranslations(input.translations), SITE_TRANSLATION_FIELDS);
  const [record] = await db
    .insert(siteSetting)
    .values({ id: 1, ...values, translationsJson, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: siteSetting.id, set: { ...values, translationsJson, updatedAt: now } })
    .returning();

  if (!record) appError("SITE_SETTINGS_NOT_FOUND");
  invalidateSiteSettings(database);
  const { translationsJson: savedTranslationsJson, ...saved } = record;
  return { ...saved, translations: readContentTranslations(savedTranslationsJson, SITE_TRANSLATION_FIELDS) };
}

export const onGetSiteSettings = telefuncAction(internalOnGetSiteSettings);
export const onSaveSiteSettings = telefuncAction(internalOnSaveSiteSettings);

