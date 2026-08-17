import { withServerDataErrorHandling } from "@/server/error-handling";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: { urlParsed: { search: Record<string, string | string[] | undefined> } }) {
  return withServerDataErrorHandling("page data: payment result", pageContext, async () => {
    const orderNo = typeof pageContext.urlParsed.search.orderNo === "string" ? pageContext.urlParsed.search.orderNo.trim() : "";
    return { orderNo };
  });
}
