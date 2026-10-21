import { errorCode } from "./app-error";
import { getActiveLocale } from "./active-locale";
import { errorMessagesByLocale } from "./i18n/error-messages";
import type { StorefrontLocale } from "./storefront-preferences";

/**
 * Single mapping source for business error codes. The Chinese dictionary is the
 * source of truth for available codes; every locale must define the same keys.
 */
export function errorMessageForCode(code: string, locale: StorefrontLocale = getActiveLocale()) {
  return errorMessagesByLocale[locale][code] ?? errorMessagesByLocale["zh-CN"][code];
}

export function userErrorMessage(cause: unknown, fallback?: string) {
  const messages = errorMessagesByLocale[getActiveLocale()];
  const fallbackMessage = fallback ?? messages.REQUEST_FAILED;
  const code = errorCode(cause);
  if (code === "REQUEST_FAILED" || code === "INTERNAL_ERROR") return fallbackMessage;
  return messages[code] ?? fallbackMessage;
}
