import { pickLocalizedText, resolveLocale, type LocalizedText } from "@/lib/i18n/localized-text";
import { seoTextFor } from "@/lib/i18n/seo";

export default function title(pageContext: { data?: { name?: LocalizedText }; site?: { name?: string }; locale?: string }) {
  const locale = resolveLocale(pageContext.locale);
  const siteName = pageContext.site?.name || seoTextFor(locale).siteName;
  const name = pageContext.data?.name ? pickLocalizedText(pageContext.data.name, locale) : "";
  return name ? `${name} - ${siteName}` : siteName;
}
