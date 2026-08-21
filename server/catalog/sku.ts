import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/database/drizzle";
import { productSku } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";

export async function getDefaultProductSku(db: AppDb, productId: number) {
  const [sku] = await db.select().from(productSku).where(eq(productSku.productId, productId)).orderBy(asc(productSku.id)).limit(1);
  if (sku) return sku;
  appError("PRODUCT_SKU_NOT_AVAILABLE");
}
