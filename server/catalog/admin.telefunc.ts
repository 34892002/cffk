import { telefuncAction } from "@/server/telefunc-action";
import { and, asc, count, eq, inArray, like, or } from "drizzle-orm";
import { requireAdmin } from "@/server/telefunc-context";
import { appError } from "@/lib/app-error";
import { slugify } from "@/lib/slugify";
import { formatCentsAsYuan, parseAmountToCents } from "@/lib/payment-utils";
import { sanitizeProductDescription } from "./product-description";
import { card, category, order, product, productSku } from "@/database/drizzle/schema";



type DeliveryType = "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS";
type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
const deliveryTypeSet = new Set<DeliveryType>(["CARD_AUTO", "FIXED_CARD", "MANUAL", "EXPRESS"]);
const productStatusSet = new Set<ProductStatus>(["DRAFT", "ACTIVE", "INACTIVE"]);

function getAdminDb() {
  const { db } = requireAdmin();
  return { db };
}

function requiredText(value: unknown, requiredCode: string, maxLength: number, tooLongCode: string) {
  if (typeof value !== "string") appError(requiredCode);
  const normalized = value.trim();
  if (!normalized) appError(requiredCode);
  if (normalized.length > maxLength) appError(tooLongCode);
  return normalized;
}

function normalizeSlug(value: string) {
  return slugify(value);
}

function resolveSlug(slug: unknown, name: string, code = "PRODUCT_SLUG_INVALID") {
  if (slug !== undefined && typeof slug !== "string") appError(code);
  const normalized = normalizeSlug((typeof slug === "string" ? slug.trim() : "") || name);
  if (!normalized || normalized.length > 160) appError(code);
  return normalized;
}

function nonNegativeInteger(value: unknown, code: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) appError(code);
  return value;
}

function optionalText(value: unknown, maxLength: number, code: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") appError(code);
  const normalized = value.trim();
  if (normalized.length > maxLength) appError(code);
  return normalized || null;
}

function resolveCoverImage(value: unknown) {
  const image = optionalText(value, 2_048, "PRODUCT_COVER_IMAGE_INVALID");
  if (!image) return null;
  if (image.startsWith("/media/proxy/")) return image;
  try {
    const url = new URL(image);
    if (url.protocol === "http:" || url.protocol === "https:") return image;
  } catch { /* Invalid URLs are rejected below. */ }
  appError("PRODUCT_COVER_IMAGE_INVALID");
}


async function resolveProductCategoryId(
  db: ReturnType<typeof getAdminDb>["db"],
  requestedCategoryId: number | null,
) {
  const [target] = requestedCategoryId === null
    ? await db
        .select({ id: category.id })
        .from(category)
        .where(and(eq(category.slug, "default"), eq(category.status, "ACTIVE")))
        .limit(1)
    : await db
        .select({ id: category.id })
        .from(category)
        .where(and(eq(category.id, requestedCategoryId), eq(category.status, "ACTIVE")))
        .limit(1);
  if (!target) appError("PRODUCT_CATEGORY_REQUIRED");
  return target.id;
}

export type ProductListQuery = { keyword?: string; categoryId?: number; status?: ProductStatus; page?: number; pageSize?: number };

async function internalOnGetCatalogAdminData(input: ProductListQuery = {}) {
  if (!input || typeof input !== "object") appError("PRODUCT_LIST_QUERY_INVALID");
  if (input.keyword !== undefined && typeof input.keyword !== "string") appError("PRODUCT_LIST_QUERY_INVALID");
  if (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 1)) appError("PRODUCT_LIST_QUERY_INVALID");
  if (input.pageSize !== undefined && (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1)) appError("PRODUCT_LIST_QUERY_INVALID");
  const { db } = getAdminDb();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 20)));
  if (input.status !== undefined && !productStatusSet.has(input.status)) appError("PRODUCT_STATUS_INVALID");
  if (input.categoryId !== undefined && (!Number.isInteger(input.categoryId) || input.categoryId <= 0)) appError("PRODUCT_CATEGORY_INVALID");
  const keyword = input.keyword?.trim().slice(0, 120) ?? "";
  const conditions = [
    keyword ? or(like(product.name, `%${keyword}%`), like(product.slug, `%${keyword}%`)) : undefined,
    input.categoryId ? eq(product.categoryId, input.categoryId) : undefined,
    input.status ? eq(product.status, input.status) : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const where = conditions.length ? and(...conditions) : undefined;
  const [categories, items, totalRows] = await Promise.all([
    db.select({ id: category.id, name: category.name, slug: category.slug, description: category.description, sort: category.sort, status: category.status }).from(category).orderBy(asc(category.sort), asc(category.id)),
    db.select({ id: product.id, categoryId: product.categoryId, name: product.name, slug: product.slug, status: product.status, sort: product.sort, categoryName: category.name }).from(product).leftJoin(category, eq(product.categoryId, category.id)).where(where).orderBy(asc(product.sort), asc(product.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(product).where(where),
  ]);
  const itemIds = items.map((item) => item.id);
    const primarySkus = itemIds.length ? await db.select({ productId: productSku.productId, price: productSku.price, deliveryType: productSku.deliveryType }).from(productSku).where(inArray(productSku.productId, itemIds)).orderBy(asc(productSku.sort), asc(productSku.id)) : [];
    const primaryByProduct = new Map<number, typeof primarySkus[number]>();
    for (const sku of primarySkus) if (!primaryByProduct.has(sku.productId)) primaryByProduct.set(sku.productId, sku);
    return { categories, items: items.map((item) => ({ ...item, price: formatCentsAsYuan(primaryByProduct.get(item.id)?.price ?? 0), deliveryType: primaryByProduct.get(item.id)?.deliveryType ?? "CARD_AUTO", physicalStock: null, minBuy: 1, maxBuy: 1 })), total: totalRows[0]?.value ?? 0, page, pageSize };
}

async function internalOnGetProductAdminDetail(input: { id: number }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  const [record] = await db.select().from(product).where(eq(product.id, input.id)).limit(1);
  if (!record) appError("PRODUCT_NOT_FOUND");
  const [sku] = await db.select({ id: productSku.id, name: productSku.name }).from(productSku).where(and(eq(productSku.productId, record.id), eq(productSku.status, "ACTIVE"))).orderBy(asc(productSku.sort), asc(productSku.id)).limit(1);
  const skus = await db.select({ id: productSku.id, name: productSku.name, price: productSku.price, status: productSku.status, deliveryType: productSku.deliveryType, fixedDeliveryContent: productSku.fixedDeliveryContent, physicalStock: productSku.physicalStock, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy, sort: productSku.sort }).from(productSku).where(eq(productSku.productId, record.id)).orderBy(asc(productSku.sort), asc(productSku.id));
  const [inventory] = sku
    ? await db.select({ available: count() }).from(card).where(and(eq(card.productSkuId, sku.id), eq(card.status, "UNUSED")))
    : [];
  return {
    product: record,
    skus: skus.map((item) => ({ ...item, price: formatCentsAsYuan(item.price) })),
    cardInventory: sku ? { available: inventory?.available ?? 0 } : null,
  };
}

async function internalOnSaveCategory(input: { id?: number; name: string; slug?: string; description?: string; sort: number }) {
  const { db } = getAdminDb();
  const now = new Date();
  const name = requiredText(input.name, "CATEGORY_NAME_REQUIRED", 120, "CATEGORY_NAME_TOO_LONG");
  const values = {
    name,
    slug: resolveSlug(input.slug, name, "SLUG_REQUIRED"),
    description: optionalText(input.description, 2_000, "CATEGORY_DESCRIPTION_INVALID"),
    sort: nonNegativeInteger(input.sort, "CATEGORY_SORT_INVALID"),
    updatedAt: now,
  };

  try {
    if (input.id) {
      const result = await db.update(category).set(values).where(eq(category.id, input.id)).returning();
      const record = result[0];
      if (!record) appError("CATEGORY_NOT_FOUND");

      return record;
    }

    const result = await db.insert(category).values({ ...values, createdAt: now }).returning();
    const record = result[0];

    return record;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) appError("CATEGORY_SLUG_CONFLICT");
    throw error;
  }
}

async function internalOnSetCategoryStatus(input: { id: number; status: "ACTIVE" | "DISABLED" }) {
  const { db } = getAdminDb();
  const [target] = await db.select({ slug: category.slug }).from(category).where(eq(category.id, input.id)).limit(1);
  if (!target) appError("CATEGORY_NOT_FOUND");
  if (target.slug === "default") appError("CATEGORY_DEFAULT_STATUS_CHANGE_FORBIDDEN");
  if (input.status === "DISABLED") {
    const [activeProductCount] = await db
      .select({ value: count() })
      .from(product)
      .where(and(eq(product.categoryId, input.id), eq(product.status, "ACTIVE")));
    if ((activeProductCount?.value ?? 0) > 0) appError("CATEGORY_HAS_ACTIVE_PRODUCTS");
  }
  const result = await db
    .update(category)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(category.id, input.id))
    .returning();
  const record = result[0];
  if (!record) appError("CATEGORY_NOT_FOUND");

  return record;
}

type ProductSkuInput = {
  id?: number;
  name: string;
  price: string;
  status: "ACTIVE" | "INACTIVE";
  deliveryType: DeliveryType;
  fixedDeliveryContent?: string;
  physicalStock: number | null;
  minBuy: number;
  maxBuy: number;
  sort: number;
};

async function internalOnSaveProduct(input: {
  id?: number;
  categoryId: number | null;
  name: string;
  slug?: string;
  subtitle?: string;
  coverImage?: string;
  description?: string;
  manualDeliveryHint?: string;
  purchaseNote?: string;
  status: ProductStatus;
  sort: number;
  skus: ProductSkuInput[];
  deliveryType: DeliveryType;
}) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object") appError("PRODUCT_INPUT_INVALID");
  if (!Array.isArray(input.skus) || input.skus.length < 1) appError("PRODUCT_SKU_REQUIRED");
  if (input.skus.length > 100) appError("PRODUCT_SKU_LIMIT_EXCEEDED");
  if (input.id !== undefined && (!Number.isInteger(input.id) || input.id <= 0)) appError("PRODUCT_ID_INVALID");
  if (!productStatusSet.has(input.status)) appError("PRODUCT_STATUS_INVALID");
  if (!deliveryTypeSet.has(input.deliveryType)) appError("PRODUCT_DELIVERY_TYPE_INVALID");

  // 上游和履约流程目前按商品选择发货方式；SKU 保留该字段是为了支持未来供应商绑定，但同一商品不能混用方式。
  const normalizedSkus = input.skus.map((sku) => {
    if (sku.deliveryType !== input.deliveryType) appError("PRODUCT_SKU_DELIVERY_TYPE_CONFLICT");
    if (!deliveryTypeSet.has(sku.deliveryType)) appError("PRODUCT_DELIVERY_TYPE_INVALID");
    if (sku.id !== undefined && (!Number.isInteger(sku.id) || sku.id < 1)) appError("PRODUCT_SKU_ID_INVALID");
    const name = requiredText(sku.name, "PRODUCT_SKU_NAME_REQUIRED", 120, "PRODUCT_SKU_NAME_TOO_LONG");
    const cents = parseAmountToCents(sku.price);
    if (!cents || cents < 1) appError("PRODUCT_PRICE_INVALID");
    const minBuy = sku.deliveryType === "FIXED_CARD" ? 1 : nonNegativeInteger(sku.minBuy, "PRODUCT_BUY_RANGE_INVALID");
    const maxBuy = sku.deliveryType === "FIXED_CARD" ? 1 : nonNegativeInteger(sku.maxBuy, "PRODUCT_BUY_RANGE_INVALID");
    if (minBuy < 1 || maxBuy < minBuy) appError("PRODUCT_BUY_RANGE_INVALID");
    const physicalStock = sku.deliveryType === "MANUAL" || sku.deliveryType === "EXPRESS"
      ? (sku.physicalStock === null ? appError("PHYSICAL_STOCK_REQUIRED") : nonNegativeInteger(sku.physicalStock, "PHYSICAL_STOCK_INVALID"))
      : null;
    const fixedDeliveryContent = optionalText(sku.fixedDeliveryContent, 10_000, "FIXED_DELIVERY_CONTENT_INVALID");
    if (sku.deliveryType === "FIXED_CARD" && sku.status === "ACTIVE" && !fixedDeliveryContent) appError("FIXED_DELIVERY_CONTENT_REQUIRED");
    if (sku.status !== "ACTIVE" && sku.status !== "INACTIVE") appError("PRODUCT_SKU_STATUS_INVALID");
    return { id: sku.id, name, price: cents, status: sku.status, deliveryType: sku.deliveryType, fixedDeliveryContent: sku.deliveryType === "FIXED_CARD" ? fixedDeliveryContent : null, physicalStock, minBuy, maxBuy, sort: nonNegativeInteger(sku.sort, "PRODUCT_SORT_INVALID") };
  });
  if (new Set(normalizedSkus.map((sku) => sku.name)).size !== normalizedSkus.length) appError("PRODUCT_SKU_NAME_CONFLICT");


  if (input.categoryId !== null && (!Number.isInteger(input.categoryId) || input.categoryId <= 0)) appError("PRODUCT_CATEGORY_INVALID");
  const categoryId = await resolveProductCategoryId(db, input.categoryId);
  const name = requiredText(input.name, "PRODUCT_NAME_REQUIRED", 120, "PRODUCT_NAME_TOO_LONG");
  const values = {
    categoryId,
    name,
    slug: resolveSlug(input.slug, name),
    subtitle: optionalText(input.subtitle, 300, "PRODUCT_SUBTITLE_INVALID"),
    coverImage: resolveCoverImage(input.coverImage),
    description: sanitizeProductDescription(requiredText(input.description, "PRODUCT_DESCRIPTION_REQUIRED", 100_000, "PRODUCT_DESCRIPTION_TOO_LONG")) ?? (appError("PRODUCT_DESCRIPTION_REQUIRED"), null),
    manualDeliveryHint: optionalText(input.manualDeliveryHint, 2_000, "PRODUCT_MANUAL_DELIVERY_HINT_INVALID"),
    purchaseNote: optionalText(input.purchaseNote, 2_000, "PRODUCT_PURCHASE_NOTE_INVALID"),
    status: input.status,
    sort: nonNegativeInteger(input.sort, "PRODUCT_SORT_INVALID"),
    updatedAt: new Date(),
  };

  try {
    const now = new Date();
    const record = input.id
      ? (await db.update(product).set(values).where(eq(product.id, input.id)).returning())[0]
      : (await db.insert(product).values({ ...values, createdAt: now }).returning())[0];
    if (!record) appError(input.id ? "PRODUCT_NOT_FOUND" : "PRODUCT_CREATE_FAILED");
    for (const sku of normalizedSkus) {
      const { id: skuId, ...skuValues } = sku;
      const skuRecord = { ...skuValues, productId: record.id, updatedAt: now };
      if (skuId) {
        const updated = await db.update(productSku).set(skuRecord).where(and(eq(productSku.id, skuId), eq(productSku.productId, record.id))).returning({ id: productSku.id });
        if (!updated[0]) appError("PRODUCT_SKU_NOT_FOUND");
      } else {
        await db.insert(productSku).values({ ...skuRecord, createdAt: now });
      }
    }
    return record;
  } catch (error) {
    const message = String(error);
    if (message.includes("productSku.productId, productSku.name")) appError("PRODUCT_SKU_NAME_CONFLICT");
    if (message.includes("product.slug")) appError("PRODUCT_SLUG_CONFLICT");
    throw error;
  }
}

async function internalOnDeleteProduct(input: { id: number }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  const [target, cardCount, orderCount] = await Promise.all([
    db.select({ id: product.id }).from(product).where(eq(product.id, input.id)).limit(1),
    db.select({ value: count() }).from(card).where(eq(card.productId, input.id)),
    db.select({ value: count() }).from(order).where(eq(order.productId, input.id)),
  ]);
  if (!target[0]) appError("PRODUCT_NOT_FOUND");
  if ((cardCount[0]?.value ?? 0) > 0 || (orderCount[0]?.value ?? 0) > 0) appError("PRODUCT_DELETE_REJECTED");
  const [deleted] = await db.delete(product).where(eq(product.id, input.id)).returning({ id: product.id });
  if (!deleted) appError("PRODUCT_NOT_FOUND");
  return deleted;
}

async function internalOnSetProductStatus(input: { id: number; status: ProductStatus }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  if (!productStatusSet.has(input.status)) appError("PRODUCT_STATUS_INVALID");
  const [current] = await db.select().from(product).where(eq(product.id, input.id)).limit(1);
  if (!current) appError("PRODUCT_NOT_FOUND");
  if (input.status === "ACTIVE") {
    const [activeSku] = await db.select({ price: productSku.price, deliveryType: productSku.deliveryType, fixedDeliveryContent: productSku.fixedDeliveryContent, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy }).from(productSku).where(and(eq(productSku.productId, current.id), eq(productSku.status, "ACTIVE"))).orderBy(asc(productSku.sort), asc(productSku.id)).limit(1);
    if (!current.categoryId || !current.slug || !activeSku || activeSku.price < 1 || activeSku.minBuy < 1 || activeSku.maxBuy < activeSku.minBuy || (activeSku.deliveryType === "FIXED_CARD" && !activeSku.fixedDeliveryContent?.trim())) appError("PRODUCT_PUBLISH_REJECTED");
  }
  const result = await db.update(product).set({ status: input.status, updatedAt: new Date() }).where(and(eq(product.id, input.id), eq(product.status, current.status))).returning();
  if (!result[0]) appError("PRODUCT_STATUS_CHANGED_RETRY");
  return result[0];
}

export const onGetCatalogAdminData = telefuncAction(internalOnGetCatalogAdminData);
export const onGetProductAdminDetail = telefuncAction(internalOnGetProductAdminDetail);
export const onSaveCategory = telefuncAction(internalOnSaveCategory);
export const onSetCategoryStatus = telefuncAction(internalOnSetCategoryStatus);
export const onSaveProduct = telefuncAction(internalOnSaveProduct);
export const onDeleteProduct = telefuncAction(internalOnDeleteProduct);
async function internalOnSaveProductSku(input: { id?: number; productId: number; name: string; price: string; status: "ACTIVE" | "INACTIVE"; deliveryType: DeliveryType; fixedDeliveryContent?: string; physicalStock: number | null; minBuy: number; maxBuy: number; sort: number }) {
  const { db } = getAdminDb();
  if (!Number.isInteger(input.productId) || input.productId < 1) appError("PRODUCT_ID_INVALID");
  const [item] = await db.select().from(product).where(eq(product.id, input.productId)).limit(1);
  if (!item) appError("PRODUCT_NOT_FOUND");
  if (input.id !== undefined && (!Number.isInteger(input.id) || input.id < 1)) appError("PRODUCT_SKU_ID_INVALID");
  if (!deliveryTypeSet.has(input.deliveryType)) appError("PRODUCT_DELIVERY_TYPE_INVALID");
  const existingSkus = await db.select({ id: productSku.id, deliveryType: productSku.deliveryType }).from(productSku).where(eq(productSku.productId, input.productId));
  if (input.id !== undefined && !existingSkus.some((sku) => sku.id === input.id)) appError("PRODUCT_SKU_NOT_FOUND");
  // 更新当前 SKU 时忽略自身，只要同商品的其他 SKU 使用了不同方式就拒绝，保证商品维度的统一履约方式。
  if (existingSkus.some((sku) => sku.id !== input.id && sku.deliveryType !== input.deliveryType)) appError("PRODUCT_SKU_DELIVERY_TYPE_CONFLICT");
  const name = requiredText(input.name, "PRODUCT_SKU_NAME_REQUIRED", 120, "PRODUCT_SKU_NAME_TOO_LONG");
  const price = parseAmountToCents(input.price);
  if (!price || price < 1) appError("PRODUCT_PRICE_INVALID");
  const minBuy = input.deliveryType === "FIXED_CARD" ? 1 : nonNegativeInteger(input.minBuy, "PRODUCT_BUY_RANGE_INVALID");
  const maxBuy = input.deliveryType === "FIXED_CARD" ? 1 : nonNegativeInteger(input.maxBuy, "PRODUCT_BUY_RANGE_INVALID");
  if (minBuy < 1 || maxBuy < minBuy) appError("PRODUCT_BUY_RANGE_INVALID");
  const physicalStock = input.deliveryType === "MANUAL" || input.deliveryType === "EXPRESS" ? (input.physicalStock === null ? appError("PHYSICAL_STOCK_REQUIRED") : nonNegativeInteger(input.physicalStock, "PHYSICAL_STOCK_INVALID")) : null;
  const fixedDeliveryContent = optionalText(input.fixedDeliveryContent, 10_000, "FIXED_DELIVERY_CONTENT_INVALID");
  if (input.deliveryType === "FIXED_CARD" && input.status === "ACTIVE" && !fixedDeliveryContent) appError("FIXED_DELIVERY_CONTENT_REQUIRED");
  const values = { name, price, status: input.status, deliveryType: input.deliveryType, fixedDeliveryContent: input.deliveryType === "FIXED_CARD" ? fixedDeliveryContent : null, physicalStock, minBuy, maxBuy, sort: nonNegativeInteger(input.sort, "PRODUCT_SORT_INVALID"), updatedAt: new Date() };
  try {
    if (input.id !== undefined) {
      const result = await db.update(productSku).set(values).where(and(eq(productSku.id, input.id), eq(productSku.productId, input.productId))).returning();
      if (!result[0]) appError("PRODUCT_SKU_NOT_FOUND");
      return result[0];
    }
    const [created] = await db.insert(productSku).values({ productId: input.productId, ...values, createdAt: new Date() }).returning();
    return created;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) appError("PRODUCT_SKU_NAME_CONFLICT");
    throw error;
  }
}

async function internalOnDeleteProductSku(input: { id: number }) {
  const { db } = getAdminDb();
  const [target] = await db.select({ id: productSku.id }).from(productSku).where(eq(productSku.id, input.id)).limit(1);
  if (!target) appError("PRODUCT_SKU_NOT_FOUND");
  const [cards] = await db.select({ value: count() }).from(card).where(eq(card.productSkuId, input.id));
  const [orders] = await db.select({ value: count() }).from(order).where(eq(order.productSkuId, input.id));
  if ((cards?.value ?? 0) > 0 || (orders?.value ?? 0) > 0) appError("PRODUCT_SKU_DELETE_REJECTED");
  await db.delete(productSku).where(eq(productSku.id, input.id));
  return { id: input.id };
}

export const onSetProductStatus = telefuncAction(internalOnSetProductStatus);
export const onSaveProductSku = telefuncAction(internalOnSaveProductSku);
export const onDeleteProductSku = telefuncAction(internalOnDeleteProductSku);
