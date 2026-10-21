export const storefrontLocales = ["zh-CN", "zh-TW", "en-US"] as const;

export type StorefrontLocale = (typeof storefrontLocales)[number];

export const defaultStorefrontLocale: StorefrontLocale = "zh-CN";
export const storefrontLocaleCookie = "storefront-locale";
export const legacyLocaleStorageKey = "storefront-locale";

export function isStorefrontLocale(value: string | null | undefined): value is StorefrontLocale {
  return value === "zh-CN" || value === "zh-TW" || value === "en-US";
}

export function detectBrowserLocale(browserLocales: readonly string[]): StorefrontLocale {
  for (const browserLocale of browserLocales) {
    const normalizedLocale = browserLocale.toLowerCase();
    if (normalizedLocale === "zh-tw" || normalizedLocale.startsWith("zh-hant") || normalizedLocale.startsWith("zh-hk") || normalizedLocale.startsWith("zh-mo")) return "zh-TW";
    if (normalizedLocale.startsWith("en")) return "en-US";
    if (normalizedLocale.startsWith("zh")) return "zh-CN";
  }

  return defaultStorefrontLocale;
}

export function readCookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * The locale used for rendering and for outbound messages on a request.
 * The cookie wins so the language chosen in the UI stays stable across devices
 * and full page loads; otherwise the browser's Accept-Language is used.
 */
export function resolveRequestLocale(input: { cookie?: string | null; acceptLanguage?: string | null }): StorefrontLocale {
  const fromCookie = readCookieValue(input.cookie, storefrontLocaleCookie);
  if (isStorefrontLocale(fromCookie)) return fromCookie;

  const accepted = (input.acceptLanguage ?? "")
    .split(",")
    .map((part) => part.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
  return accepted.length > 0 ? detectBrowserLocale(accepted) : defaultStorefrontLocale;
}

export function resolveHeadersLocale(headers: Record<string, string | undefined> | undefined) {
  return resolveRequestLocale({ cookie: headers?.cookie ?? null, acceptLanguage: headers?.["accept-language"] ?? null });
}
