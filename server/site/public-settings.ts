import { eq } from "drizzle-orm";
import { siteSetting } from "@/database/drizzle/schema";
import { createDrizzleDb } from "@/database/drizzle";

export type PublicSiteSettings = {
  name: string;
  subtitle: string | null;
  siteUrl: string | null;
  logo: string | null;
  logoIcon: string | null;
  notice: string | null;
  supportContact: string | null;
  footerText: string | null;
  orderNotice: string | null;
};

type SiteSettingRecord = typeof siteSetting.$inferSelect;

type CacheEntry = {
  value: SiteSettingRecord;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const settingsCache = new WeakMap<D1Database, CacheEntry>();

const defaultSettings: SiteSettingRecord = {
  id: 1,
  siteName: "CFFK发卡",
  siteUrl: null,
  siteSubtitle: null,
  logo: null,
  logoIcon: null,
  notice: null,
  supportContact: null,
  footerText: null,
  orderNotice: null,
  headCode: null,
  footerCode: null,
  timezone: "Asia/Shanghai",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

async function querySettings(database: D1Database) {
  const db = createDrizzleDb(database);
  const [record] = await db.select().from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  return record ?? defaultSettings;
}

export async function getSiteSettings(database: D1Database) {
  const cached = settingsCache.get(database);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await querySettings(database);
  settingsCache.set(database, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateSiteSettings(database: D1Database) {
  settingsCache.delete(database);
}

export function toPublicSiteSettings(record: SiteSettingRecord): PublicSiteSettings {
  return {
    name: record.siteName,
    subtitle: record.siteSubtitle,
    siteUrl: record.siteUrl,
    logo: record.logo,
    logoIcon: record.logoIcon || record.logo,
    notice: record.notice,
    supportContact: record.supportContact,
    footerText: record.footerText,
    orderNotice: record.orderNotice,
  };
}
