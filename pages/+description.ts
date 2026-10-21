import { pickLocalizedText, resolveLocale, type LocalizedNullableText } from "@/lib/i18n/localized-text";
import { seoTextFor } from "@/lib/i18n/seo";

export default function description(pageContext: { site?: { subtitle?: LocalizedNullableText | null }; locale?: string }) {
  const locale = resolveLocale(pageContext.locale);
  const subtitle = pageContext.site?.subtitle ? pickLocalizedText(pageContext.site.subtitle, locale) : "";
  return subtitle.trim() || seoTextFor(locale).description;
}
