import type { StorefrontLocale } from "./storefront-preferences";

let activeLocale: StorefrontLocale = "zh-CN";

/**
 * The interface locale used for client-side feedback (toasts and inline errors).
 * Admin pages never mount the storefront preferences, so they keep the default.
 */
export function setActiveLocale(locale: StorefrontLocale) {
  activeLocale = locale;
}

export function getActiveLocale(): StorefrontLocale {
  return activeLocale;
}
