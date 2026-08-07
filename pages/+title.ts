export default function title(pageContext: { site?: { name?: string } }) {
  return pageContext.site?.name || "CFFK发卡";
}
