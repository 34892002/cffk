import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card, category, product } from "@/database/drizzle/schema";

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
    price: number;
    deliveryType: "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS";
    stockMode: "FINITE" | "UNLIMITED";
    physicalStock: number | null;
    availableStock: number | null;
    isVisibleStock: boolean;
    minBuy: number;
    maxBuy: number;
  }>;
};

export type PublicProductDetail = PublicCatalog["products"][number] & {
  description: string | null;
  purchaseNote: string | null;
  manualDeliveryHint: string | null;
  isContactRequired: boolean;
};

export async function getPublicProductDetail(database: D1Database, slug: string): Promise<PublicProductDetail | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const db = createDrizzleDb(database);
  const [item] = await db
    .select({
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      slug: product.slug,
      subtitle: product.subtitle,
      coverImage: product.coverImage,
      description: product.description,
      purchaseNote: product.purchaseNote,
      manualDeliveryHint: product.manualDeliveryHint,
      price: product.price,
      deliveryType: product.deliveryType,
      stockMode: product.stockMode,
      physicalStock: product.physicalStock,
      isVisibleStock: product.isVisibleStock,
      isContactRequired: product.isContactRequired,
      minBuy: product.minBuy,
      maxBuy: product.maxBuy,
      categoryName: category.name,
    })
    .from(product)
    .leftJoin(category, and(eq(product.categoryId, category.id), eq(category.status, "ACTIVE")))
    .where(and(eq(product.slug, normalizedSlug), eq(product.status, "ACTIVE"), eq(category.status, "ACTIVE")))
    .limit(1);
  if (!item) return null;

  const availableStock = item.deliveryType === "CARD_AUTO"
    ? await countAvailableCardStock(db, item.id)
    : item.physicalStock;
  return { ...item, availableStock };
}

async function countAvailableCardStock(db: ReturnType<typeof createDrizzleDb>, productId: number) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(card)
    .where(and(eq(card.productId, productId), eq(card.status, "UNUSED")));
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
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        subtitle: product.subtitle,
        coverImage: product.coverImage,
        price: product.price,
        deliveryType: product.deliveryType,
        stockMode: product.stockMode,
        physicalStock: product.physicalStock,
        isVisibleStock: product.isVisibleStock,
        minBuy: product.minBuy,
        maxBuy: product.maxBuy,
      })
      .from(product)
      .innerJoin(category, and(eq(product.categoryId, category.id), eq(category.status, "ACTIVE")))
      .where(eq(product.status, "ACTIVE"))
      .orderBy(asc(product.sort), asc(product.id)),
  ]);

  const categoryIds = [...new Set(products.flatMap((item) => (item.categoryId === null ? [] : [item.categoryId])))];
  const categoryNames = categoryIds.length
    ? await db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(and(eq(category.status, "ACTIVE"), inArray(category.id, categoryIds)))
    : [];
  const categoryNameById = new Map(categoryNames.map((item) => [item.id, item.name]));
  const cardProductIds = products.filter((item) => item.deliveryType === "CARD_AUTO").map((item) => item.id);
  const cardStockRows = cardProductIds.length
    ? await db
        .select({ productId: card.productId, availableStock: sql<number>`count(*)` })
        .from(card)
        .where(and(inArray(card.productId, cardProductIds), eq(card.status, "UNUSED")))
        .groupBy(card.productId)
    : [];
  const cardStockByProductId = new Map(cardStockRows.map((item) => [item.productId, item.availableStock]));

  return {
    categories: categories.filter((item) => categoryNameById.has(item.id)),
    products: products.map((item) => ({
      ...item,
      availableStock: item.deliveryType === "CARD_AUTO" ? cardStockByProductId.get(item.id) ?? 0 : item.physicalStock,
      categoryName: item.categoryId === null ? null : categoryNameById.get(item.categoryId) ?? null,
    })), 
  };
}
