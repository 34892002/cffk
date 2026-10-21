import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card, category, productV2, productSku } from "@/database/drizzle/schema";
import { CATEGORY_TRANSLATION_FIELDS, PRODUCT_TRANSLATION_FIELDS, SKU_TRANSLATION_FIELDS, readContentTranslations } from "@/lib/content-translations";
import { displayCategoryName } from "@/lib/i18n/category-names";
import { buildLocalizedOptionalText, buildLocalizedText, type LocalizedNullableText, type LocalizedText } from "@/lib/i18n/localized-text";
import { formatCentsAsYuan } from "@/lib/payment-utils";

export type PublicSku = {
  id: number;
  name: LocalizedText;
  price: string;
  deliveryType: "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS" | "SUPPLIER";
  physicalStock: number | null;
  availableStock: number | null;
  minBuy: number;
  maxBuy: number;
};

export type PublicCatalog = {
  categories: Array<{
    id: number;
    name: LocalizedText;
    slug: string;
    description: LocalizedNullableText;
  }>;
  products: Array<{
    id: number;
    categoryId: number | null;
    categoryName: LocalizedNullableText | null;
    name: LocalizedText;
    slug: string;
    subtitle: LocalizedNullableText;
    coverImage: string | null;
    price: string;
    deliveryType: "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS" | "SUPPLIER";

    physicalStock: number | null;
    availableStock: number | null;

    minBuy: number;
    maxBuy: number;
  }>;
};

export type PublicProductDetail = PublicCatalog["products"][number] & {
  description: LocalizedNullableText;
  purchaseNote: string | null;
  manualDeliveryHint: string | null;
  skus: PublicSku[];
};

function categoryNameMap(item: { slug: string | null; name: string; translationsJson: string | null }): LocalizedText {
  const translations = readContentTranslations(item.translationsJson, CATEGORY_TRANSLATION_FIELDS);
  return {
    "zh-CN": displayCategoryName({ slug: item.slug, name: item.name, translations, locale: "zh-CN" }) ?? item.name,
    "zh-TW": displayCategoryName({ slug: item.slug, name: item.name, translations, locale: "zh-TW" }) ?? item.name,
    "en-US": displayCategoryName({ slug: item.slug, name: item.name, translations, locale: "en-US" }) ?? item.name,
  };
}

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
      translationsJson: productV2.translationsJson,
      categoryName: category.name,
      categorySlug: category.slug,
      categoryTranslationsJson: category.translationsJson,
    })
    .from(productV2)
    .leftJoin(category, and(eq(productV2.categoryId, category.id), eq(category.status, "ACTIVE")))
    .where(and(eq(productV2.slug, normalizedSlug), eq(productV2.status, "ACTIVE"), eq(category.status, "ACTIVE")))
    .limit(1);
  if (!item) return null;

  const skuRows = await db.select({ id: productSku.id, name: productSku.name, price: productSku.price, deliveryType: productSku.deliveryType, physicalStock: productSku.physicalStock, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy, translationsJson: productSku.translationsJson }).from(productSku).where(and(eq(productSku.productId, item.id), eq(productSku.status, "ACTIVE"))).orderBy(asc(productSku.sort), asc(productSku.id));
  const skus = await Promise.all(skuRows.map(async (sku) => ({
    id: sku.id,
    name: buildLocalizedText(sku.name, readContentTranslations(sku.translationsJson, SKU_TRANSLATION_FIELDS), "name"),
    price: formatCentsAsYuan(sku.price),
    deliveryType: sku.deliveryType,
    physicalStock: sku.physicalStock,
    minBuy: sku.minBuy,
    maxBuy: sku.maxBuy,
    availableStock: sku.deliveryType === "CARD_AUTO" ? await countAvailableCardStockBySku(db, sku.id) : sku.deliveryType === "SUPPLIER" ? null : sku.physicalStock,
  })));
  const primary = skus[0];
  if (!primary) return null;
  const translations = readContentTranslations(item.translationsJson, PRODUCT_TRANSLATION_FIELDS);
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: buildLocalizedText(item.name, translations, "name"),
    slug: item.slug,
    subtitle: buildLocalizedOptionalText(item.subtitle, translations, "subtitle"),
    coverImage: item.coverImage,
    description: buildLocalizedOptionalText(item.description, translations, "description"),
    purchaseNote: item.purchaseNote,
    manualDeliveryHint: item.manualDeliveryHint,
    categoryName: item.categoryName === null ? null : categoryNameMap({ slug: item.categorySlug, name: item.categoryName, translationsJson: item.categoryTranslationsJson }),
    price: primary.price,
    deliveryType: primary.deliveryType,
    physicalStock: primary.physicalStock,
    availableStock: primary.availableStock,
    minBuy: primary.minBuy,
    maxBuy: primary.maxBuy,
    skus,
  };
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
        translationsJson: category.translationsJson,
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
        translationsJson: productV2.translationsJson,
      })
      .from(productV2)
      .innerJoin(category, and(eq(productV2.categoryId, category.id), eq(category.status, "ACTIVE")))
      .where(eq(productV2.status, "ACTIVE"))
      .orderBy(asc(productV2.sort), asc(productV2.id)),
  ]);

  const categoryIds = [...new Set(products.flatMap((item) => (item.categoryId === null ? [] : [item.categoryId])))];
  const categoryRows = categoryIds.length
    ? await db
        .select({ id: category.id, name: category.name, slug: category.slug, translationsJson: category.translationsJson })
        .from(category)
        .where(and(eq(category.status, "ACTIVE"), inArray(category.id, categoryIds)))
    : [];
  const categoryNameById = new Map(categoryRows.map((item) => [item.id, categoryNameMap(item)]));
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
    categories: categories.flatMap((item) => categoryNameById.has(item.id)
      ? [{
          id: item.id,
          name: categoryNameById.get(item.id)!,
          slug: item.slug,
          description: buildLocalizedOptionalText(item.description, readContentTranslations(item.translationsJson, CATEGORY_TRANSLATION_FIELDS), "description"),
        }]
      : []),
    products: products.flatMap((item) => {
      const sku = primaryByProduct.get(item.id);
      if (!sku) return [];
      const translations = readContentTranslations(item.translationsJson, PRODUCT_TRANSLATION_FIELDS);
      return [{
        id: item.id,
        categoryId: item.categoryId,
        categoryName: item.categoryId === null ? null : categoryNameById.get(item.categoryId) ?? null,
        name: buildLocalizedText(item.name, translations, "name"),
        slug: item.slug,
        subtitle: buildLocalizedOptionalText(item.subtitle, translations, "subtitle"),
        coverImage: item.coverImage,
        price: formatCentsAsYuan(sku.price),
        deliveryType: sku.deliveryType,
        physicalStock: sku.physicalStock,
        availableStock: sku.deliveryType === "CARD_AUTO" ? cardStockBySkuId.get(sku.id) ?? 0 : sku.deliveryType === "SUPPLIER" ? null : sku.physicalStock,
        minBuy: sku.minBuy,
        maxBuy: sku.maxBuy,
      }];
    }),
  };
}
