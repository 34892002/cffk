import type { ContentTranslations } from "@/lib/content-translations";
import type { StorefrontLocale } from "./locale";

/** Seeded name of the `default` category. */
export const defaultCategoryBaseName = "默认分类";

const defaultCategoryNames: Record<StorefrontLocale, string> = {
  "zh-CN": "默认分类",
  "zh-TW": "預設分類",
  "en-US": "General",
};

/**
 * The `default` category cannot be edited in the admin, so it never receives a
 * translation. Fall back to a built-in label for that one system category.
 */
export function displayCategoryName(input: {
  slug?: string | null;
  name: string | null;
  translations?: ContentTranslations | null;
  locale: StorefrontLocale;
}): string | null {
  if (input.name === null) return null;
  const translated = input.translations?.[input.locale]?.name?.trim();
  if (translated) return translated;
  if (input.slug === "default" && input.name.trim() === defaultCategoryBaseName) return defaultCategoryNames[input.locale] ?? input.name;
  return input.name;
}
