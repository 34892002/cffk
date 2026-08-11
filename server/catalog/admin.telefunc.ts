import { and, asc, count, eq, like, or } from "drizzle-orm";
import { pinyin } from "pinyin-pro";
import { requireAdmin } from "@/server/telefunc-context";
import { appError } from "@/lib/app-error";
import { formatCentsAsYuan, parseAmountToCents } from "@/lib/payment-utils";
import { sanitizeProductDescription } from "./product-description";
import { card, category, product } from "@/database/drizzle/schema";


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
  return pinyin(value, { toneType: "none", nonZh: "consecutive" })
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

export async function onGetCatalogAdminData(input: ProductListQuery = {}) {
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
    db.select({ id: category.id, name: category.name, slug: category.slug, status: category.status }).from(category).orderBy(asc(category.sort), asc(category.id)),
    db.select({ id: product.id, categoryId: product.categoryId, name: product.name, slug: product.slug, price: product.price, status: product.status, deliveryType: product.deliveryType, physicalStock: product.physicalStock, minBuy: product.minBuy, maxBuy: product.maxBuy, sort: product.sort, categoryName: category.name }).from(product).leftJoin(category, eq(product.categoryId, category.id)).where(where).orderBy(asc(product.sort), asc(product.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(product).where(where),
  ]);
  return { categories, items: items.map((item) => ({ ...item, price: formatCentsAsYuan(item.price) })), total: totalRows[0]?.value ?? 0, page, pageSize };
}

export async function onGetProductAdminDetail(input: { id: number }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  const [record] = await db.select().from(product).where(eq(product.id, input.id)).limit(1);
  if (!record) appError("PRODUCT_NOT_FOUND");
  const [inventory] = record.deliveryType === "CARD_AUTO"
    ? await db
        .select({ available: count() })
        .from(card)
        .where(and(eq(card.productId, record.id), eq(card.status, "UNUSED")))
    : [];
  return {
    product: { ...record, price: formatCentsAsYuan(record.price) },
    cardInventory: record.deliveryType === "CARD_AUTO"
      ? { available: inventory?.available ?? 0 }
      : null,
  };
}

export async function onSaveCategory(input: { id?: number; name: string; slug?: string; description?: string; sort: number }) {
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

export async function onSetCategoryStatus(input: { id: number; status: "ACTIVE" | "DISABLED" }) {
  const { db } = getAdminDb();
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

export async function onSaveProduct(input: {
  id?: number;
  categoryId: number | null;
  name: string;
  slug?: string;
  subtitle?: string;
  coverImage?: string;
  description?: string;
  fixedDeliveryContent?: string;
  manualDeliveryHint?: string;
  purchaseNote?: string;

  price: string;
  status: ProductStatus;
  deliveryType: DeliveryType;
  physicalStock: number | null;
  minBuy: number;
  maxBuy: number;
  sort: number;
}) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object") appError("PRODUCT_INPUT_INVALID");
  if (input.id !== undefined && (!Number.isInteger(input.id) || input.id <= 0)) appError("PRODUCT_ID_INVALID");
  if (!deliveryTypeSet.has(input.deliveryType)) appError("PRODUCT_DELIVERY_TYPE_INVALID");
  if (!productStatusSet.has(input.status)) appError("PRODUCT_STATUS_INVALID");
  const now = new Date();
  const requestedMinBuy = nonNegativeInteger(input.minBuy, "PRODUCT_BUY_RANGE_INVALID");
  const requestedMaxBuy = nonNegativeInteger(input.maxBuy, "PRODUCT_BUY_RANGE_INVALID");
  const minBuy = input.deliveryType === "FIXED_CARD" ? 1 : requestedMinBuy;
  const maxBuy = input.deliveryType === "FIXED_CARD" ? 1 : requestedMaxBuy;
  if (minBuy < 1 || maxBuy < minBuy) appError("PRODUCT_BUY_RANGE_INVALID");
  const physicalStock = input.deliveryType === "MANUAL" || input.deliveryType === "EXPRESS"
    ? (input.physicalStock === null ? null : nonNegativeInteger(input.physicalStock, "PHYSICAL_STOCK_INVALID"))
    : null;
  const fixedDeliveryContent = optionalText(input.fixedDeliveryContent, 10_000, "FIXED_DELIVERY_CONTENT_INVALID");
  if (input.deliveryType === "FIXED_CARD" && input.status === "ACTIVE" && !fixedDeliveryContent) appError("FIXED_DELIVERY_CONTENT_REQUIRED");
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
    fixedDeliveryContent: input.deliveryType === "FIXED_CARD" ? fixedDeliveryContent : null,
    manualDeliveryHint: (input.deliveryType === "MANUAL" || input.deliveryType === "EXPRESS") ? optionalText(input.manualDeliveryHint, 2_000, "PRODUCT_MANUAL_DELIVERY_HINT_INVALID") : null,
    purchaseNote: optionalText(input.purchaseNote, 2_000, "PRODUCT_PURCHASE_NOTE_INVALID"),

    price: parseAmountToCents(input.price) ?? (appError("PRODUCT_PRICE_INVALID"), 0),
    status: input.status,
    deliveryType: input.deliveryType,
    stockMode: input.deliveryType === "CARD_AUTO" ? "FINITE" as const : "UNLIMITED" as const,
    physicalStock,
    minBuy,
    maxBuy,
    sort: nonNegativeInteger(input.sort, "PRODUCT_SORT_INVALID"),
    updatedAt: now,
  };

  try {
    if (input.id) {
      const result = await db.update(product).set(values).where(eq(product.id, input.id)).returning();
      const record = result[0];
      if (!record) appError("PRODUCT_NOT_FOUND");

      return record;
    }

    const result = await db.insert(product).values({ ...values, createdAt: now }).returning();
    const record = result[0];

    return record;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) appError("PRODUCT_SLUG_CONFLICT");
    throw error;
  }
}

export async function onSetProductStatus(input: { id: number; status: ProductStatus }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  if (!productStatusSet.has(input.status)) appError("PRODUCT_STATUS_INVALID");
  const [current] = await db.select().from(product).where(eq(product.id, input.id)).limit(1);
  if (!current) appError("PRODUCT_NOT_FOUND");
  if (input.status === "ACTIVE") {
    if (!current.categoryId || !current.slug || current.price < 0 || current.minBuy < 1 || current.maxBuy < current.minBuy || (current.deliveryType === "FIXED_CARD" && !current.fixedDeliveryContent?.trim())) appError("PRODUCT_PUBLISH_REJECTED");
  }
  const result = await db.update(product).set({ status: input.status, updatedAt: new Date() }).where(and(eq(product.id, input.id), eq(product.status, current.status))).returning();
  if (!result[0]) appError("PRODUCT_STATUS_CHANGED_RETRY");
  return result[0];
}
