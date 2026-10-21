import type { ContentTranslations } from "@/lib/content-translations";
import { defaultStorefrontLocale, isStorefrontLocale, type StorefrontLocale } from "./locale";

/** The same field for every supported locale, resolved on the server once. */
export type LocalizedText = Record<StorefrontLocale, string>;
export type LocalizedNullableText = Record<StorefrontLocale, string | null>;

function localizedValue(base: string | null, translations: ContentTranslations | null | undefined, field: string, locale: StorefrontLocale): string | null {
  return translations?.[locale]?.[field]?.trim() || base;
}

export function buildLocalizedText(base: string, translations: ContentTranslations | null | undefined, field: string): LocalizedText {
  return {
    "zh-CN": base,
    "zh-TW": localizedValue(base, translations, field, "zh-TW") ?? base,
    "en-US": localizedValue(base, translations, field, "en-US") ?? base,
  };
}

export function buildLocalizedOptionalText(base: string | null, translations: ContentTranslations | null | undefined, field: string): LocalizedNullableText {
  return {
    "zh-CN": base,
    "zh-TW": localizedValue(base, translations, field, "zh-TW"),
    "en-US": localizedValue(base, translations, field, "en-US"),
  };
}

export function resolveLocale(value: string | null | undefined): StorefrontLocale {
  return isStorefrontLocale(value) ? value : defaultStorefrontLocale;
}

export function pickLocalizedText(value: LocalizedText | LocalizedNullableText, locale: StorefrontLocale): string {
  return value[locale] ?? value[defaultStorefrontLocale] ?? "";
}

export function pickLocalizedOptionalText(value: LocalizedNullableText, locale: StorefrontLocale): string | null {
  return value[locale] ?? value[defaultStorefrontLocale] ?? null;
}
