export default function description(pageContext: { site?: { subtitle?: string | null } }) {
  return pageContext.site?.subtitle || "自动发卡系统";
}
