import { eq } from "drizzle-orm";
import { siteSetting } from "@/database/drizzle/schema";
import { createDrizzleDb } from "@/database/drizzle";
import { SITE_TRANSLATION_FIELDS, readContentTranslations } from "@/lib/content-translations";
import { buildLocalizedOptionalText, buildLocalizedText, type LocalizedNullableText, type LocalizedText } from "@/lib/i18n/localized-text";
import { BASE_CURRENCY, isCurrencyCode, isValidExchangeRate, type CurrencyCode } from "@/lib/money";

export { SITE_TRANSLATION_FIELDS };

export type PublicSiteSettings = {
  name: string;
  subtitle: LocalizedNullableText;
  siteUrl: string | null;
  logo: string | null;
  logoIcon: string | null;
  notice: LocalizedNullableText;
  noticePopupEnabled: boolean;
  supportContact: LocalizedText;
  footerText: LocalizedText;
  orderNotice: LocalizedNullableText;
  currency: CurrencyCode;
};

type SiteSettingRecord = typeof siteSetting.$inferSelect;

type CacheEntry = {
  value: SiteSettingRecord;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
let settingsCache: CacheEntry | null = null;

export const DEFAULT_FOOTER_TEXT = "© 2026 CFFK 基于 GitHub 开源";
export const DEFAULT_SUPPORT_CONTACT = "TG互助群|https://t.me/edgeKeyGroup";

const defaultSettings: SiteSettingRecord = {
  id: 1,
  siteName: "CFFK-Shop",
  siteUrl: null,
  siteSubtitle: null,
  logo: null,
  logoIcon: null,
  notice: null,
  noticePopupEnabled: false,
  supportContact: null,
  footerText: null,
  orderNotice: null,
  headCode: null,
  footerCode: null,
  translationsJson: null,
  registrationEnabled: false,
  timezone: "Asia/Shanghai",
  currency: BASE_CURRENCY,
  exchangeRate: 1,
  currencyUpdatedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

async function querySettings(database: D1Database) {
  const db = createDrizzleDb(database);
  const [record] = await db.select().from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  return record ?? defaultSettings;
}

export async function getSiteSettings(database: D1Database) {
  if (settingsCache && settingsCache.expiresAt > Date.now()) return settingsCache.value;

  const value = await querySettings(database);
  settingsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export function invalidateSiteSettings(_database?: D1Database) {
  settingsCache = null;
}

export function toPublicSiteSettings(record: SiteSettingRecord): PublicSiteSettings {
  const translations = readContentTranslations(record.translationsJson, SITE_TRANSLATION_FIELDS);
  return {
    name: record.siteName,
    subtitle: buildLocalizedOptionalText(record.siteSubtitle, translations, "subtitle"),
    siteUrl: record.siteUrl,
    logo: record.logo,
    logoIcon: record.logoIcon || record.logo,
    notice: buildLocalizedOptionalText(record.notice, translations, "notice"),
    noticePopupEnabled: record.noticePopupEnabled === true,
    supportContact: buildLocalizedText(record.supportContact?.trim() || DEFAULT_SUPPORT_CONTACT, translations, "supportContact"),
    footerText: buildLocalizedText(record.footerText?.trim() || DEFAULT_FOOTER_TEXT, translations, "footerText"),
    orderNotice: buildLocalizedOptionalText(record.orderNotice, translations, "orderNotice"),
    currency: isCurrencyCode(record.currency) ? record.currency : BASE_CURRENCY,
  };
}

/** The settings row is validated on write; these guards keep old rows usable. */
export function storeCurrency(record: SiteSettingRecord): CurrencyCode {
  return isCurrencyCode(record.currency) ? record.currency : BASE_CURRENCY;
}

export function storeExchangeRate(record: SiteSettingRecord): number {
  return isValidExchangeRate(record.exchangeRate) ? record.exchangeRate : 1;
}
