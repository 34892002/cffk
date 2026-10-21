import { defaultStorefrontLocale, isStorefrontLocale, type StorefrontLocale } from "./locale";

type SeoText = {
  siteName: string;
  description: string;
};

// Kept separate from the UI dictionaries so `+title`/`+description` never pull
// the full message tables into admin-only page chunks.
const seoText: Record<StorefrontLocale, SeoText> = {
  "zh-CN": { siteName: "CFFK-Shop", description: "自动发卡系统" },
  "zh-TW": { siteName: "CFFK-Shop", description: "自動發卡系統" },
  "en-US": { siteName: "CFFK-Shop", description: "Automated digital goods store" },
};

export function seoTextFor(locale: string | null | undefined): SeoText {
  return seoText[isStorefrontLocale(locale) ? locale : defaultStorefrontLocale];
}
