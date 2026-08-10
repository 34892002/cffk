export default function title(pageContext: { data?: { name?: string }; site?: { name?: string } }) {
  const siteName = pageContext.site?.name || "CFFK-Shop";
  return pageContext.data?.name ? `${pageContext.data.name} - ${siteName}` : siteName;
}
