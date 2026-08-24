import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card, category, productV2, productSku } from "@/database/drizzle/schema";
import { formatCentsAsYuan } from "@/lib/payment-utils";

export type PublicSku = {
  id: number;
  name: string;
  price: string;
  deliveryType: "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS";
  physicalStock: number | null;
  availableStock: number | null;
  minBuy: number;
  maxBuy: number;
};

export type PublicCatalog = {
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    description: string | null;
  }>;
  products: Array<{
    id: number;
    categoryId: number | null;
    categoryName: string | null;
    name: string;
    slug: string;
    subtitle: string | null;
    coverImage: string | null;
    price: string;
    deliveryType: "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS";

    physicalStock: number | null;
    availableStock: number | null;

    minBuy: number;
    maxBuy: number;
  }>;
};

export type PublicProductDetail = PublicCatalog["products"][number] & {
  description: string | null;
  purchaseNote: string | null;
  manualDeliveryHint: string | null;
  skus: PublicSku[];

};

export async function getPublicProductDetail(database: D1Database, slug: string): Promise<PublicProductDetail | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const db = createDrizzleDb(database);
  const [item] = await db
    .select({
      id: productV2.id,
      categoryId: productV2.categoryId,
      name: productV2.name,
      slug: productV2.slug,
      subtitle: productV2.subtitle,
      coverImage: productV2.coverImage,
      description: productV2.description,
      purchaseNote: productV2.purchaseNote,
      manualDeliveryHint: productV2.manualDeliveryHint,
      categoryName: category.name,
    })
    .from(productV2)
    .leftJoin(category, and(eq(productV2.categoryId, category.id), eq(category.status, "ACTIVE")))
    .where(and(eq(productV2.slug, normalizedSlug), eq(productV2.status, "ACTIVE"), eq(category.status, "ACTIVE")))
    .limit(1);
  if (!item) return null;

  const skuRows = await db.select({ id: productSku.id, name: productSku.name, price: productSku.price, deliveryType: productSku.deliveryType, physicalStock: productSku.physicalStock, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy }).from(productSku).where(and(eq(productSku.productId, item.id), eq(productSku.status, "ACTIVE"))).orderBy(asc(productSku.sort), asc(productSku.id));
  const skus = await Promise.all(skuRows.map(async (sku) => ({ ...sku, price: formatCentsAsYuan(sku.price), availableStock: sku.deliveryType === "CARD_AUTO" ? await countAvailableCardStockBySku(db, sku.id) : sku.physicalStock })));
  const primary = skus[0];
  if (!primary) return null;
  return { ...item, ...primary, skus };
}

async function countAvailableCardStockBySku(db: ReturnType<typeof createDrizzleDb>, skuId: number) {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(card).where(and(eq(card.productSkuId, skuId), eq(card.status, "UNUSED")));
  return result?.count ?? 0;
}


export async function getPublicCatalog(database: D1Database): Promise<PublicCatalog> {
  const db = createDrizzleDb(database);
  const [categories, products] = await Promise.all([
    db
      .select({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
      })
      .from(category)
      .where(eq(category.status, "ACTIVE"))
      .orderBy(asc(category.sort), asc(category.id)),
    db
      .select({
        id: productV2.id,
        categoryId: productV2.categoryId,
        name: productV2.name,
        slug: productV2.slug,
        subtitle: productV2.subtitle,
        coverImage: productV2.coverImage,
      })
      .from(productV2)
      .innerJoin(category, and(eq(productV2.categoryId, category.id), eq(category.status, "ACTIVE")))
      .where(eq(productV2.status, "ACTIVE"))
      .orderBy(asc(productV2.sort), asc(productV2.id)),
  ]);

  const categoryIds = [...new Set(products.flatMap((item) => (item.categoryId === null ? [] : [item.categoryId])))];
  const categoryNames = categoryIds.length
    ? await db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(and(eq(category.status, "ACTIVE"), inArray(category.id, categoryIds)))
    : [];
  const categoryNameById = new Map(categoryNames.map((item) => [item.id, item.name]));
  const itemIds = products.map((item) => item.id);
  const skuRows = itemIds.length
    ? await db.select({ productId: productSku.productId, id: productSku.id, price: productSku.price, deliveryType: productSku.deliveryType, physicalStock: productSku.physicalStock, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy })
      .from(productSku)
      .where(and(inArray(productSku.productId, itemIds), eq(productSku.status, "ACTIVE")))
      .orderBy(asc(productSku.sort), asc(productSku.id))
    : [];
  const primaryByProduct = new Map<number, typeof skuRows[number]>();
  for (const sku of skuRows) if (!primaryByProduct.has(sku.productId)) primaryByProduct.set(sku.productId, sku);
  const cardSkuIds = skuRows.filter((sku) => sku.deliveryType === "CARD_AUTO").map((sku) => sku.id);
  const cardStockRows = cardSkuIds.length ? await db.select({ productSkuId: card.productSkuId, availableStock: sql<number>`count(*)` }).from(card).where(and(inArray(card.productSkuId, cardSkuIds), eq(card.status, "UNUSED"))).groupBy(card.productSkuId) : [];
  const cardStockBySkuId = new Map(cardStockRows.map((item) => [item.productSkuId, item.availableStock]));

  return {
    categories: categories.filter((item) => categoryNameById.has(item.id)),
    products: products.flatMap((item) => {
      const sku = primaryByProduct.get(item.id);
      if (!sku) return [];
      return [{ ...item, price: formatCentsAsYuan(sku.price), deliveryType: sku.deliveryType, physicalStock: sku.physicalStock, availableStock: sku.deliveryType === "CARD_AUTO" ? cardStockBySkuId.get(sku.id) ?? 0 : sku.physicalStock, minBuy: sku.minBuy, maxBuy: sku.maxBuy, categoryName: item.categoryId === null ? null : categoryNameById.get(item.categoryId) ?? null }];
    }),
  };
}
