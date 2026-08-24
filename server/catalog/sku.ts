import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/database/drizzle";
import { productSku } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";

export async function getProductSku(db: AppDb, productId: number, productSkuId: number) {
  const [sku] = await db
    .select()
    .from(productSku)
    .where(and(eq(productSku.id, productSkuId), eq(productSku.productId, productId), eq(productSku.status, "ACTIVE")))
    .limit(1);
  if (sku) return sku;
  appError("PRODUCT_SKU_NOT_AVAILABLE");
}
