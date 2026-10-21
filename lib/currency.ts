import type { StorefrontLocale } from "./i18n/locale";

/** Orders are always settled in CNY; no exchange-rate conversion is applied. */
export const storefrontCurrencyCode = "CNY";

/**
 * Simplified Chinese is the base language and `¥` is unambiguous there.
 * Other locales get an explicit currency code next to the amount.
 */
export function currencyHintFor(locale: StorefrontLocale): string | null {
  return locale === "zh-CN" ? null : storefrontCurrencyCode;
}
