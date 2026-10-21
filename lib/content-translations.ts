import { defaultStorefrontLocale, isStorefrontLocale, type StorefrontLocale } from "./i18n/locale";

/** Base content stays in the original columns; only these locales are translated. */
export const contentTranslationLocales = ["zh-TW", "en-US"] as const;
export type ContentTranslationLocale = (typeof contentTranslationLocales)[number];

export const PRODUCT_TRANSLATION_FIELDS = ["name", "subtitle", "description"] as const;
export const SKU_TRANSLATION_FIELDS = ["name"] as const;
export const CATEGORY_TRANSLATION_FIELDS = ["name", "description"] as const;
export const SITE_TRANSLATION_FIELDS = ["subtitle", "notice", "footerText", "orderNotice", "supportContact"] as const;

export type ContentTranslation = Partial<Record<string, string>>;
// Keys are validated at runtime (`isContentTranslationLocale`); keeping the type
// as a plain string index avoids Telefunc's shield generating unquoted
// hyphenated keys such as `en-US: ...`.
export type ContentTranslations = Partial<Record<string, ContentTranslation>>;

export function isContentTranslationLocale(value: string | null | undefined): value is ContentTranslationLocale {
  return value === "zh-TW" || value === "en-US";
}

/**
 * Reads a stored `translationsJson` value. Unknown locales, unknown fields and
 * non-string values are ignored so old or hand-edited rows never break a page.
 */
export function readContentTranslations(json: string | null | undefined, fields: readonly string[]): ContentTranslations {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  return normalizeContentTranslations(parsed, fields);
}

/** Validates admin input into the same shape. Empty strings mean "fall back to base". */
export function normalizeContentTranslations(input: unknown, fields: readonly string[]): ContentTranslations {
  if (!input || typeof input !== "object") return {};
  const allowed = new Set(fields);
  const translations: ContentTranslations = {};
  for (const [locale, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isContentTranslationLocale(locale) || !value || typeof value !== "object") continue;
    const content: ContentTranslation = {};
    for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!allowed.has(field) || typeof raw !== "string") continue;
      const normalized = raw.trim();
      if (normalized) content[field] = normalized;
    }
    if (Object.keys(content).length > 0) translations[locale] = content;
  }
  return translations;
}

export function serializeContentTranslations(input: unknown, fields: readonly string[]): string | null {
  const translations = normalizeContentTranslations(input, fields);
  return Object.keys(translations).length > 0 ? JSON.stringify(translations) : null;
}

/**
 * Returns the translated value for one field, falling back to the base column.
 * Chinese is the base language, so no lookup happens for `zh-CN`.
 */
export function localizeContentText(
  base: string | null | undefined,
  translations: ContentTranslations | null | undefined,
  locale: string | null | undefined,
  field: string,
): string | null {
  if (!isContentTranslationLocale(locale)) return base ?? null;
  const translated = translations?.[locale]?.[field]?.trim();
  return translated || base || null;
}

/** The locale an admin is editing content for; anything unknown falls back to the base language. */
export function resolveContentEditLocale(locale: string | null | undefined): StorefrontLocale {
  return isStorefrontLocale(locale) ? locale : defaultStorefrontLocale;
}
