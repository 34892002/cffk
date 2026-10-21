import { seoTextFor } from "@/lib/i18n/seo";

export default function title(pageContext: { data?: { name?: string }; site?: { name?: string }; locale?: string }) {
  const siteName = pageContext.site?.name || seoTextFor(pageContext.locale).siteName;
  return pageContext.data?.name ? `${pageContext.data.name} - ${siteName}` : siteName;
}
