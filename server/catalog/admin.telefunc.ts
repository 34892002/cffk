import { telefuncAction } from "@/server/telefunc-action";
import { and, asc, count, eq, inArray, like, or } from "drizzle-orm";
import { requireAdmin } from "@/server/telefunc-context";
import { appError } from "@/lib/app-error";
import { slugify } from "@/lib/slugify";
import { formatCentsAsYuan, parseAmountToCents } from "@/lib/payment-utils";
import { sanitizeProductDescription } from "./product-description";
import { card, category, order, productV2, productSku, supplierBinding } from "@/database/drizzle/schema";
import { assertSupplierSkuPublishable } from "@/server/supplier/eligibility";



type DeliveryType = "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS" | "SUPPLIER";
type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
const deliveryTypeSet = new Set<DeliveryType>(["CARD_AUTO", "FIXED_CARD", "MANUAL", "EXPRESS", "SUPPLIER"]);
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
    keyword ? or(like(productV2.name, `%${keyword}%`), like(productV2.slug, `%${keyword}%`)) : undefined,
    input.categoryId ? eq(productV2.categoryId, input.categoryId) : undefined,
    input.status ? eq(productV2.status, input.status) : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const where = conditions.length ? and(...conditions) : undefined;
  const [categories, items, totalRows] = await Promise.all([
    db.select({ id: category.id, name: category.name, slug: category.slug, description: category.description, sort: category.sort, status: category.status }).from(category).orderBy(asc(category.sort), asc(category.id)),
    db.select({ id: productV2.id, categoryId: productV2.categoryId, name: productV2.name, slug: productV2.slug, status: productV2.status, sort: productV2.sort, categoryName: category.name }).from(productV2).leftJoin(category, eq(productV2.categoryId, category.id)).where(where).orderBy(asc(productV2.sort), asc(productV2.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(productV2).where(where),
  ]);
  const itemIds = items.map((item) => item.id);
    const primarySkus = itemIds.length ? await db.select({ productId: productSku.productId, price: productSku.price, fulfillmentSource: productSku.fulfillmentSource, deliveryType: productSku.deliveryType }).from(productSku).where(inArray(productSku.productId, itemIds)).orderBy(asc(productSku.sort), asc(productSku.id)) : [];
    const primaryByProduct = new Map<number, typeof primarySkus[number]>();
    for (const sku of primarySkus) if (!primaryByProduct.has(sku.productId)) primaryByProduct.set(sku.productId, sku);
    return { categories, items: items.map((item) => ({ ...item, price: formatCentsAsYuan(primaryByProduct.get(item.id)?.price ?? 0), fulfillmentSource: primaryByProduct.get(item.id)?.fulfillmentSource ?? "LOCAL", deliveryType: primaryByProduct.get(item.id)?.deliveryType ?? "CARD_AUTO", physicalStock: null, minBuy: 1, maxBuy: 1 })), total: totalRows[0]?.value ?? 0, page, pageSize };
}

async function internalOnGetProductAdminDetail(input: { id: number }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  const [record] = await db.select().from(productV2).where(eq(productV2.id, input.id)).limit(1);
  if (!record) appError("PRODUCT_NOT_FOUND");
  const [sku] = await db.select({ id: productSku.id, name: productSku.name, fulfillmentSource: productSku.fulfillmentSource, deliveryType: productSku.deliveryType }).from(productSku).where(and(eq(productSku.productId, record.id), eq(productSku.status, "ACTIVE"))).orderBy(asc(productSku.sort), asc(productSku.id)).limit(1);
  const skus = await db.select({ id: productSku.id, name: productSku.name, price: productSku.price, status: productSku.status, fulfillmentSource: productSku.fulfillmentSource, deliveryType: productSku.deliveryType, fixedDeliveryContent: productSku.fixedDeliveryContent, physicalStock: productSku.physicalStock, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy, sort: productSku.sort }).from(productSku).where(eq(productSku.productId, record.id)).orderBy(asc(productSku.sort), asc(productSku.id));
  const [inventory] = sku?.fulfillmentSource === "LOCAL" && sku.deliveryType === "CARD_AUTO"
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
      .from(productV2)
      .where(and(eq(productV2.categoryId, input.id), eq(productV2.status, "ACTIVE")));
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
  if (!deliveryTypeSet.has(input.deliveryType) || input.deliveryType === "SUPPLIER") appError("PRODUCT_DELIVERY_TYPE_INVALID");
  if (input.id) {
    const [supplierSku] = await db.select({ id: productSku.id }).from(productSku).where(and(eq(productSku.productId, input.id), eq(productSku.fulfillmentSource, "SUPPLIER"))).limit(1);
    if (supplierSku) appError("SUPPLIER_SKU_EDIT_REJECTED");
  }

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
    if (sku.deliveryType === "SUPPLIER") appError("SUPPLIER_FULFILLMENT_INVALID");
    const physicalStock = sku.deliveryType === "MANUAL" || sku.deliveryType === "EXPRESS"
      ? (sku.physicalStock === null ? appError("PHYSICAL_STOCK_REQUIRED") : nonNegativeInteger(sku.physicalStock, "PHYSICAL_STOCK_INVALID"))
      : null;
    const fixedDeliveryContent = optionalText(sku.fixedDeliveryContent, 10_000, "FIXED_DELIVERY_CONTENT_INVALID");
    if (sku.deliveryType === "FIXED_CARD" && sku.status === "ACTIVE" && !fixedDeliveryContent) appError("FIXED_DELIVERY_CONTENT_REQUIRED");
    if (sku.status !== "ACTIVE" && sku.status !== "INACTIVE") appError("PRODUCT_SKU_STATUS_INVALID");
    return { id: sku.id, name, price: cents, status: sku.status, fulfillmentSource: "LOCAL" as const, deliveryType: sku.deliveryType, fixedDeliveryContent: sku.deliveryType === "FIXED_CARD" ? fixedDeliveryContent : null, physicalStock, minBuy, maxBuy, sort: nonNegativeInteger(sku.sort, "PRODUCT_SORT_INVALID") };
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
      ? (await db.update(productV2).set(values).where(eq(productV2.id, input.id)).returning())[0]
      : (await db.insert(productV2).values({ ...values, createdAt: now }).returning())[0];
    if (!record) appError(input.id ? "PRODUCT_NOT_FOUND" : "PRODUCT_CREATE_FAILED");
    for (const sku of normalizedSkus) {
      const { id: skuId, ...skuValues } = sku;
      const skuRecord = { ...skuValues, productId: record.id, updatedAt: now };
      if (skuId) {
        const [currentSku] = await db.select({ fulfillmentSource: productSku.fulfillmentSource }).from(productSku).where(and(eq(productSku.id, skuId), eq(productSku.productId, record.id))).limit(1);
        if (currentSku?.fulfillmentSource === "SUPPLIER") appError("SUPPLIER_SKU_EDIT_REJECTED");
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
    if (message.includes("product_v2.slug")) appError("PRODUCT_SLUG_CONFLICT");
    throw error;
  }
}

async function internalOnDeleteProduct(input: { id: number }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  const [target, cardCount, orderCount] = await Promise.all([
    db.select({ id: productV2.id }).from(productV2).where(eq(productV2.id, input.id)).limit(1),
    db.select({ value: count() }).from(card).where(eq(card.productId, input.id)),
    db.select({ value: count() }).from(order).where(eq(order.productId, input.id)),
  ]);
  if (!target[0]) appError("PRODUCT_NOT_FOUND");
  if ((cardCount[0]?.value ?? 0) > 0 || (orderCount[0]?.value ?? 0) > 0) appError("PRODUCT_DELETE_REJECTED");
  // Neither productSku nor supplierBinding cascades from product_v2. Remove
  // bindings first, then the now-orphaned local SKUs.
  const skuRows = await db.select({ id: productSku.id }).from(productSku).where(eq(productSku.productId, input.id));
  for (const sku of skuRows) await db.delete(supplierBinding).where(eq(supplierBinding.productSkuId, sku.id));
  await db.delete(productSku).where(eq(productSku.productId, input.id));
  const [deleted] = await db.delete(productV2).where(eq(productV2.id, input.id)).returning({ id: productV2.id });
  if (!deleted) appError("PRODUCT_NOT_FOUND");
  return deleted;
}

async function internalOnSetProductStatus(input: { id: number; status: ProductStatus }) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id <= 0) appError("PRODUCT_ID_INVALID");
  if (!productStatusSet.has(input.status)) appError("PRODUCT_STATUS_INVALID");
  const [current] = await db.select().from(productV2).where(eq(productV2.id, input.id)).limit(1);
  if (!current) appError("PRODUCT_NOT_FOUND");
  if (input.status === "ACTIVE") {
    const skus = await db.select({ id: productSku.id, status: productSku.status, price: productSku.price, fulfillmentSource: productSku.fulfillmentSource, deliveryType: productSku.deliveryType, fixedDeliveryContent: productSku.fixedDeliveryContent, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy }).from(productSku).where(eq(productSku.productId, current.id)).orderBy(asc(productSku.sort), asc(productSku.id));
    const isSupplierProduct = skus.length > 0 && skus.every((sku) => sku.fulfillmentSource === "SUPPLIER");
    const supplierBindingRows = isSupplierProduct
      ? await db.select({ productSkuId: supplierBinding.productSkuId }).from(supplierBinding).where(and(inArray(supplierBinding.productSkuId, skus.map((sku) => sku.id)), eq(supplierBinding.enabled, true)))
      : [];
    const boundSupplierSkuIds = new Set(supplierBindingRows.map((row) => row.productSkuId));
    // A supplier product may contain historical/orphaned local SKUs from an
    // older import. Only enabled bindings are publishable; inactive legacy
    // rows must not block re-publishing the valid SKU set.
    const publishableSkus = isSupplierProduct
      ? skus.filter((sku) => boundSupplierSkuIds.has(sku.id))
      : skus.filter((sku) => sku.status === "ACTIVE");
    if (!current.categoryId || !current.slug || !publishableSkus.length) appError("PRODUCT_PUBLISH_REJECTED");
    for (const sku of publishableSkus) {
      if (sku.price < 1 || sku.minBuy < 1 || sku.maxBuy < sku.minBuy) appError("PRODUCT_PUBLISH_REJECTED");
      if (sku.fulfillmentSource === "SUPPLIER") {
        if (sku.deliveryType !== "SUPPLIER") appError("SUPPLIER_FULFILLMENT_INVALID");
        await assertSupplierSkuPublishable(db, sku.id);
      } else if (sku.deliveryType === "FIXED_CARD" && !sku.fixedDeliveryContent?.trim()) appError("PRODUCT_PUBLISH_REJECTED");
    }
    if (isSupplierProduct) {
      const now = new Date();
      for (const sku of publishableSkus) await db.update(productSku).set({ status: "ACTIVE", updatedAt: now }).where(eq(productSku.id, sku.id));
    }
  }
  const result = await db.update(productV2).set({ status: input.status, updatedAt: new Date() }).where(and(eq(productV2.id, input.id), eq(productV2.status, current.status))).returning();
  if (!result[0]) appError("PRODUCT_STATUS_CHANGED_RETRY");
  return result[0];
}

export const onGetCatalogAdminData = telefuncAction(internalOnGetCatalogAdminData);
export const onGetProductAdminDetail = telefuncAction(internalOnGetProductAdminDetail);
export const onSaveCategory = telefuncAction(internalOnSaveCategory);
export const onSetCategoryStatus = telefuncAction(internalOnSetCategoryStatus);
export const onSaveProduct = telefuncAction(internalOnSaveProduct);
export const onDeleteProduct = telefuncAction(internalOnDeleteProduct);

type SupplierPresentationSkuInput = {
  id: number;
  name: string;
  price: string;
  status: "ACTIVE" | "INACTIVE";
  sort: number;
};

async function internalOnSaveSupplierProductPresentation(input: {
  id: number;
  categoryId: number | null;
  name: string;
  slug?: string;
  subtitle?: string;
  coverImage?: string;
  description?: string;
  purchaseNote?: string;
  status: ProductStatus;
  sort: number;
  skus: SupplierPresentationSkuInput[];
}) {
  const { db } = getAdminDb();
  if (!input || typeof input !== "object" || !Number.isInteger(input.id) || input.id < 1) appError("PRODUCT_ID_INVALID");
  if (!productStatusSet.has(input.status) || !Array.isArray(input.skus) || !input.skus.length) appError("PRODUCT_INPUT_INVALID");
  const [current] = await db.select({ id: productV2.id }).from(productV2).where(eq(productV2.id, input.id)).limit(1);
  if (!current) appError("PRODUCT_NOT_FOUND");
  const currentSkus = await db.select({ id: productSku.id, fulfillmentSource: productSku.fulfillmentSource, deliveryType: productSku.deliveryType }).from(productSku).where(eq(productSku.productId, input.id));
  if (!currentSkus.length || currentSkus.some((sku) => sku.fulfillmentSource !== "SUPPLIER" || sku.deliveryType !== "SUPPLIER")) appError("SUPPLIER_SKU_EDIT_REJECTED");
  if (input.skus.length !== currentSkus.length || input.skus.some((sku) => !Number.isInteger(sku.id) || !currentSkus.some((currentSku) => currentSku.id === sku.id))) appError("SUPPLIER_SKU_EDIT_REJECTED");
  const normalizedSkus = input.skus.map((sku) => {
    const price = parseAmountToCents(sku.price);
    if (!price || price < 1 || (sku.status !== "ACTIVE" && sku.status !== "INACTIVE")) appError("PRODUCT_INPUT_INVALID");
    return { id: sku.id, name: requiredText(sku.name, "PRODUCT_SKU_NAME_REQUIRED", 120, "PRODUCT_SKU_NAME_TOO_LONG"), price, status: sku.status, sort: nonNegativeInteger(sku.sort, "PRODUCT_SORT_INVALID") };
  });
  if (new Set(normalizedSkus.map((sku) => sku.name)).size !== normalizedSkus.length) appError("PRODUCT_SKU_NAME_CONFLICT");
  const categoryId = await resolveProductCategoryId(db, input.categoryId);
  const name = requiredText(input.name, "PRODUCT_NAME_REQUIRED", 120, "PRODUCT_NAME_TOO_LONG");
  const now = new Date();
  const enabledBindingRows = await db.select({ productSkuId: supplierBinding.productSkuId }).from(supplierBinding).where(and(inArray(supplierBinding.productSkuId, currentSkus.map((sku) => sku.id)), eq(supplierBinding.enabled, true)));
  const boundSkuIds = new Set(enabledBindingRows.map((row) => row.productSkuId));
  if (input.status === "ACTIVE") {
    // Older supplier imports created their bound SKUs as INACTIVE. A valid
    // enabled binding is the source of truth when publishing such products.
    const activeSkus = normalizedSkus.filter((sku) => boundSkuIds.has(sku.id));
    if (!activeSkus.length) appError("PRODUCT_PUBLISH_REJECTED");
    for (const sku of activeSkus) await assertSupplierSkuPublishable(db, sku.id);
  }
  for (const sku of normalizedSkus) {
    const status = input.status === "ACTIVE" && boundSkuIds.has(sku.id) ? "ACTIVE" : sku.status;
    await db.update(productSku).set({ name: sku.name, price: sku.price, status, sort: sku.sort, updatedAt: now }).where(and(eq(productSku.id, sku.id), eq(productSku.productId, input.id)));
  }
  const [saved] = await db.update(productV2).set({ categoryId, name, slug: resolveSlug(input.slug, name), subtitle: optionalText(input.subtitle, 300, "PRODUCT_SUBTITLE_INVALID"), coverImage: resolveCoverImage(input.coverImage), description: sanitizeProductDescription(requiredText(input.description, "PRODUCT_DESCRIPTION_REQUIRED", 100_000, "PRODUCT_DESCRIPTION_TOO_LONG")) ?? (appError("PRODUCT_DESCRIPTION_REQUIRED"), null), purchaseNote: optionalText(input.purchaseNote, 2_000, "PRODUCT_PURCHASE_NOTE_INVALID"), status: input.status, sort: nonNegativeInteger(input.sort, "PRODUCT_SORT_INVALID"), updatedAt: now }).where(eq(productV2.id, input.id)).returning();
  if (!saved) appError("PRODUCT_NOT_FOUND");
  return saved;
}

export const onSaveSupplierProductPresentation = telefuncAction(internalOnSaveSupplierProductPresentation);
async function internalOnSaveProductSku(input: { id?: number; productId: number; name: string; price: string; status: "ACTIVE" | "INACTIVE"; deliveryType: DeliveryType; fixedDeliveryContent?: string; physicalStock: number | null; minBuy: number; maxBuy: number; sort: number }) {
  const { db } = getAdminDb();
  if (!Number.isInteger(input.productId) || input.productId < 1) appError("PRODUCT_ID_INVALID");
  const [item] = await db.select().from(productV2).where(eq(productV2.id, input.productId)).limit(1);
  if (!item) appError("PRODUCT_NOT_FOUND");
  if (input.id !== undefined && (!Number.isInteger(input.id) || input.id < 1)) appError("PRODUCT_SKU_ID_INVALID");
  if (!deliveryTypeSet.has(input.deliveryType) || input.deliveryType === "SUPPLIER") appError("PRODUCT_DELIVERY_TYPE_INVALID");
  const existingSkus = await db.select({ id: productSku.id, fulfillmentSource: productSku.fulfillmentSource, deliveryType: productSku.deliveryType }).from(productSku).where(eq(productSku.productId, input.productId));
  const targetSku = input.id === undefined ? undefined : existingSkus.find((sku) => sku.id === input.id);
  if (input.id !== undefined && !targetSku) appError("PRODUCT_SKU_NOT_FOUND");
  if (targetSku?.fulfillmentSource === "SUPPLIER" || existingSkus.some((sku) => sku.fulfillmentSource === "SUPPLIER")) appError("SUPPLIER_SKU_EDIT_REJECTED");
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
  const values = { name, price, status: input.status, fulfillmentSource: "LOCAL" as const, deliveryType: input.deliveryType, fixedDeliveryContent: input.deliveryType === "FIXED_CARD" ? fixedDeliveryContent : null, physicalStock, minBuy, maxBuy, sort: nonNegativeInteger(input.sort, "PRODUCT_SORT_INVALID"), updatedAt: new Date() };
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
