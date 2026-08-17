function toPlainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export default function description(pageContext: { data?: { subtitle?: string | null; description?: string | null }; site?: { subtitle?: string | null } }) {
  const product = pageContext.data;
  return product?.subtitle?.trim() || (product?.description ? toPlainText(product.description) : "") || pageContext.site?.subtitle || "自动发卡系统";
}
