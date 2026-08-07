import { and, asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/server/telefunc-context";
import { category, product } from "@/database/drizzle/schema";


type DeliveryType = "CARD_AUTO" | "FIXED_CARD" | "MANUAL" | "EXPRESS";
type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

function getAdminDb() {
  const { db } = requireAdmin();
  return { db };
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_REQUIRED`);
  return normalized;
}

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("SLUG_REQUIRED");
  return slug;
}

function nonNegativeInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field}_INVALID`);
  return Math.floor(value);
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
  if (!target) throw new Error("PRODUCT_CATEGORY_REQUIRED");
  return target.id;
}

export async function onGetCatalogAdminData() {
  const { db } = getAdminDb();
  const [categories, products] = await Promise.all([
    db.select().from(category).orderBy(asc(category.sort), asc(category.id)),
    db
      .select({
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        subtitle: product.subtitle,
        description: product.description,
        fixedDeliveryContent: product.fixedDeliveryContent,
        manualDeliveryHint: product.manualDeliveryHint,
        purchaseNote: product.purchaseNote,
        isVisibleStock: product.isVisibleStock,
        isContactRequired: product.isContactRequired,
        price: product.price,
        status: product.status,
        deliveryType: product.deliveryType,
        stockMode: product.stockMode,
        physicalStock: product.physicalStock,
        minBuy: product.minBuy,
        maxBuy: product.maxBuy,
        sort: product.sort,
        categoryName: category.name,
      })
      .from(product)
      .leftJoin(category, eq(product.categoryId, category.id))
      .orderBy(asc(product.sort), asc(product.id)),
  ]);

  return { categories, products };
}

export async function onSaveCategory(input: { id?: number; name: string; slug: string; description?: string; sort: number }) {
  const { db } = getAdminDb();
  const now = new Date();
  const values = {
    name: requiredText(input.name, "CATEGORY_NAME"),
    slug: normalizeSlug(input.slug),
    description: input.description?.trim() || null,
    sort: nonNegativeInteger(input.sort, "CATEGORY_SORT"),
    updatedAt: now,
  };

  try {
    if (input.id) {
      const result = await db.update(category).set(values).where(eq(category.id, input.id)).returning();
      const record = result[0];
      if (!record) throw new Error("CATEGORY_NOT_FOUND");

      return record;
    }

    const result = await db.insert(category).values({ ...values, createdAt: now }).returning();
    const record = result[0];

    return record;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) throw new Error("CATEGORY_SLUG_CONFLICT");
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
    if ((activeProductCount?.value ?? 0) > 0) throw new Error("CATEGORY_HAS_ACTIVE_PRODUCTS");
  }
  const result = await db
    .update(category)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(category.id, input.id))
    .returning();
  const record = result[0];
  if (!record) throw new Error("CATEGORY_NOT_FOUND");

  return record;
}

export async function onSaveProduct(input: {
  id?: number;
  categoryId: number | null;
  name: string;
  slug: string;
  subtitle?: string;
  description?: string;
  fixedDeliveryContent?: string;
  manualDeliveryHint?: string;
  purchaseNote?: string;
  isVisibleStock: boolean;
  isContactRequired: boolean;
  price: number;
  status: ProductStatus;
  deliveryType: DeliveryType;
  physicalStock: number | null;
  minBuy: number;
  maxBuy: number;
  sort: number;
}) {
  const { db } = getAdminDb();
  const now = new Date();
  const minBuy = Math.max(1, nonNegativeInteger(input.minBuy, "MIN_BUY"));
  const maxBuy = Math.max(minBuy, nonNegativeInteger(input.maxBuy, "MAX_BUY"));
  const physicalStock = input.deliveryType === "MANUAL" || input.deliveryType === "EXPRESS"
    ? (input.physicalStock === null ? null : nonNegativeInteger(input.physicalStock, "PHYSICAL_STOCK"))
    : null;
  const fixedDeliveryContent = input.fixedDeliveryContent?.trim() || null;
  if (input.deliveryType === "FIXED_CARD" && input.status === "ACTIVE" && !fixedDeliveryContent) throw new Error("FIXED_DELIVERY_CONTENT_REQUIRED");
  const categoryId = await resolveProductCategoryId(db, input.categoryId);
  const values = {
    categoryId,
    name: requiredText(input.name, "PRODUCT_NAME"),
    slug: normalizeSlug(input.slug),
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    fixedDeliveryContent: input.deliveryType === "FIXED_CARD" ? fixedDeliveryContent : null,
    manualDeliveryHint: (input.deliveryType === "MANUAL" || input.deliveryType === "EXPRESS") ? input.manualDeliveryHint?.trim() || null : null,
    purchaseNote: input.purchaseNote?.trim() || null,
    isVisibleStock: input.isVisibleStock,
    isContactRequired: input.isContactRequired,
    price: nonNegativeInteger(input.price, "PRICE"),
    status: input.status,
    deliveryType: input.deliveryType,
    stockMode: input.deliveryType === "CARD_AUTO" ? "FINITE" as const : "UNLIMITED" as const,
    physicalStock,
    minBuy,
    maxBuy,
    sort: nonNegativeInteger(input.sort, "PRODUCT_SORT"),
    updatedAt: now,
  };

  try {
    if (input.id) {
      const result = await db.update(product).set(values).where(eq(product.id, input.id)).returning();
      const record = result[0];
      if (!record) throw new Error("PRODUCT_NOT_FOUND");

      return record;
    }

    const result = await db.insert(product).values({ ...values, createdAt: now }).returning();
    const record = result[0];

    return record;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) throw new Error("PRODUCT_SLUG_CONFLICT");
    throw error;
  }
}

export async function onSetProductStatus(input: { id: number; status: ProductStatus }) {
  const { db } = getAdminDb();
  const result = await db
    .update(product)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(product.id, input.id)))
    .returning();
  const record = result[0];
  if (!record) throw new Error("PRODUCT_NOT_FOUND");

  return record;
}
