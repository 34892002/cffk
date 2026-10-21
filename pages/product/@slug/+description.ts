import { pickLocalizedText, resolveLocale, type LocalizedNullableText } from "@/lib/i18n/localized-text";
import { seoTextFor } from "@/lib/i18n/seo";

function toPlainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export default function description(pageContext: {
  data?: { subtitle?: LocalizedNullableText; description?: LocalizedNullableText };
  site?: { subtitle?: LocalizedNullableText | null };
  locale?: string;
}) {
  const locale = resolveLocale(pageContext.locale);
  const product = pageContext.data;
  const subtitle = product?.subtitle ? pickLocalizedText(product.subtitle, locale).trim() : "";
  const body = product?.description ? pickLocalizedText(product.description, locale) : "";
  const siteSubtitle = pageContext.site?.subtitle ? pickLocalizedText(pageContext.site.subtitle, locale) : "";
  return subtitle || (body ? toPlainText(body) : "") || siteSubtitle || seoTextFor(locale).description;
}
