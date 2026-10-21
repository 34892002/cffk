import { seoTextFor } from "@/lib/i18n/seo";

export default function description(pageContext: { site?: { subtitle?: string | null }; locale?: string }) {
  return pageContext.site?.subtitle || seoTextFor(pageContext.locale).description;
}
