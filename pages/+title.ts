import { seoTextFor } from "@/lib/i18n/seo";

export default function title(pageContext: { site?: { name?: string }; locale?: string }) {
  return pageContext.site?.name || seoTextFor(pageContext.locale).siteName;
}
