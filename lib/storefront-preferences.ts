import { computed, onMounted, ref, type ComputedRef } from "vue";

import enUS from "@/lib/i18n/en-US";
import zhCN from "@/lib/i18n/zh-CN";
import zhTW from "@/lib/i18n/zh-TW";

const locales = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "zh-TW": zhTW,
} as const;

export type StorefrontLocale = keyof typeof locales;
export type StorefrontTheme = "light" | "dark";
type Messages = (typeof locales)[StorefrontLocale];

const localeStorageKey = "storefront-locale";
const themeStorageKey = "storefront-theme";
const locale = ref<StorefrontLocale>("zh-CN");
const theme = ref<StorefrontTheme>("light");
let initialized = false;

function isLocale(value: string | null): value is StorefrontLocale {
  return value === "zh-CN" || value === "zh-TW" || value === "en-US";
}

function isTheme(value: string | null): value is StorefrontTheme {
  return value === "light" || value === "dark";
}

function applyDocumentPreferences() {
  document.documentElement.classList.toggle("dark", theme.value === "dark");
  document.documentElement.lang = locale.value;
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const savedLocale = window.localStorage.getItem(localeStorageKey);
  const savedTheme = window.localStorage.getItem(themeStorageKey);
  if (isLocale(savedLocale)) locale.value = savedLocale;
  if (isTheme(savedTheme)) theme.value = savedTheme;
  applyDocumentPreferences();
}

function replaceParams(value: string, params: Record<string, string | number>) {
  return value.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

export function useStorefrontPreferences(): {
  locale: typeof locale;
  theme: typeof theme;
  messages: ComputedRef<Messages>;
  setLocale: (nextLocale: StorefrontLocale) => void;
  setTheme: (nextTheme: StorefrontTheme) => void;
  t: (value: string, params?: Record<string, string | number>) => string;
} {
  onMounted(initialize);

  const messages = computed(() => locales[locale.value]);

  function setLocale(nextLocale: StorefrontLocale) {
    locale.value = nextLocale;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(localeStorageKey, nextLocale);
    applyDocumentPreferences();
  }

  function setTheme(nextTheme: StorefrontTheme) {
    theme.value = nextTheme;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(themeStorageKey, nextTheme);
    applyDocumentPreferences();
  }

  function t(value: string, params: Record<string, string | number> = {}) {
    return replaceParams(value, params);
  }

  return { locale, theme, messages, setLocale, setTheme, t };
}
