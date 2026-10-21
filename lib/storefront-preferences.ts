import { computed, onMounted, ref, type ComputedRef } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

import { setActiveLocale } from "@/lib/active-locale";
import enUS from "@/lib/i18n/en-US";
import { defaultStorefrontLocale, isStorefrontLocale, legacyLocaleStorageKey, readCookieValue, storefrontLocaleCookie, type StorefrontLocale } from "@/lib/i18n/locale";
import zhCN from "@/lib/i18n/zh-CN";
import zhTW from "@/lib/i18n/zh-TW";

const locales = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "zh-TW": zhTW,
} as const;

export type { StorefrontLocale } from "@/lib/i18n/locale";
export type StorefrontTheme = "light" | "dark";
type Messages = (typeof locales)[StorefrontLocale];

const themeStorageKey = "storefront-theme";
const localeOverride = ref<StorefrontLocale | null>(null);
const theme = ref<StorefrontTheme>("light");
let initialized = false;

function isTheme(value: string | null): value is StorefrontTheme {
  return value === "light" || value === "dark";
}

function writeLocaleCookie(value: StorefrontLocale) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${storefrontLocaleCookie}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax${secure}`;
}

/**
 * Content such as product names, site settings and the footer is shipped for
 * every locale, so switching language only needs to update the cookie and the
 * reactive locale ref.
 */

function applyDocumentPreferences(locale: StorefrontLocale) {
  document.documentElement.classList.toggle("dark", theme.value === "dark");
  document.documentElement.lang = locale;
}

function initialize(serverLocale: StorefrontLocale) {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Locale used to live only in localStorage. Adopt it once, then keep the
  // cookie as the single source so the server can render the right language.
  if (!isStorefrontLocale(readCookieValue(document.cookie, storefrontLocaleCookie))) {
    const legacyLocale = window.localStorage.getItem(legacyLocaleStorageKey);
    if (isStorefrontLocale(legacyLocale)) {
      localeOverride.value = legacyLocale;
      writeLocaleCookie(legacyLocale);
    }
  }
  window.localStorage.removeItem(legacyLocaleStorageKey);

  const savedTheme = window.localStorage.getItem(themeStorageKey);
  if (isTheme(savedTheme)) theme.value = savedTheme;

  const activeLocale = localeOverride.value ?? serverLocale;
  setActiveLocale(activeLocale);
  applyDocumentPreferences(activeLocale);
}

function replaceParams(value: string, params: Record<string, string | number>) {
  return value.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

export function useStorefrontPreferences(): {
  locale: ComputedRef<StorefrontLocale>;
  theme: typeof theme;
  messages: ComputedRef<Messages>;
  setLocale: (nextLocale: StorefrontLocale) => void;
  setTheme: (nextTheme: StorefrontTheme) => void;
  t: (value: string, params?: Record<string, string | number>) => string;
} {
  const pageContext = usePageContext() as { locale?: string };
  const serverLocale = isStorefrontLocale(pageContext.locale) ? pageContext.locale : defaultStorefrontLocale;
  const locale = computed<StorefrontLocale>(() => localeOverride.value ?? serverLocale);
  const messages = computed(() => locales[locale.value]);

  onMounted(() => initialize(serverLocale));

  function setLocale(nextLocale: StorefrontLocale) {
    if (nextLocale === locale.value) return;
    localeOverride.value = nextLocale;
    setActiveLocale(nextLocale);
    if (typeof window === "undefined") return;
    writeLocaleCookie(nextLocale);
    applyDocumentPreferences(nextLocale);
  }

  function setTheme(nextTheme: StorefrontTheme) {
    theme.value = nextTheme;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(themeStorageKey, nextTheme);
    applyDocumentPreferences(locale.value);
  }

  function t(value: string, params: Record<string, string | number> = {}) {
    return replaceParams(value, params);
  }

  return { locale, theme, messages, setLocale, setTheme, t };
}
