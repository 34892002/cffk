import { telefuncAction } from "@/server/telefunc-action";
import { and, asc, count, desc, eq, gte, like, lt } from "drizzle-orm";
import type { createDrizzleDb } from "@/database/drizzle";
import { appError } from "@/lib/app-error";
import { requireAdmin } from "@/server/telefunc-context";
import { card, productV2, productSku } from "@/database/drizzle/schema";

import { getSiteSettings } from "@/server/site/public-settings";
import { dateBoundaryInTimezone } from "@/lib/site-timezone";


type CardStatus = "UNUSED" | "SOLD" | "DISABLED";

type CardAdminQuery = {
  productId?: number;
  status?: CardStatus;
  batchNo?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

function getAdminDb() {
  const { db } = requireAdmin();
  return { db };
}

function positiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) appError(`${field}_INVALID`);
  return value;
}

function previewCard(content: string) {
  return content.length <= 8 ? content : `${content.slice(0, 4)}****${content.slice(-4)}`;
}

function parseDateBoundary(value: string, timezone: string, isEnd: boolean) {
  return dateBoundaryInTimezone(value, timezone, isEnd);
}

async function assertCardProduct(db: ReturnType<typeof createDrizzleDb>, productId: number, productSkuId?: number) {
  const [target] = await db
    .select({ id: productV2.id })
    .from(productV2)
    .where(eq(productV2.id, productId))
    .limit(1);
  if (!target) appError("PRODUCT_NOT_FOUND");

  if (productSkuId !== undefined) {
    const [sku] = await db.select({ id: productSku.id, deliveryType: productSku.deliveryType })
      .from(productSku).where(and(eq(productSku.id, productSkuId), eq(productSku.productId, productId))).limit(1);
    if (!sku) appError("PRODUCT_SKU_NOT_FOUND");
    if (sku.deliveryType !== "CARD_AUTO") appError("PRODUCT_SKU_DELIVERY_TYPE_INVALID");
  }
}

async function resolveCardSku(db: ReturnType<typeof createDrizzleDb>, productId: number, productSkuId: number | undefined) {
  if (productSkuId === undefined) appError("PRODUCT_SKU_NOT_AVAILABLE");
  await assertCardProduct(db, productId, productSkuId);
  return productSkuId;
}


async function internalOnGetCardAdminData(input: CardAdminQuery = {}) {
  const { database, db } = requireAdmin();
  const timezone = (await getSiteSettings(database)).timezone;
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 20)));
  const batchNo = input.batchNo?.trim();
  const conditions = [
    input.productId ? eq(card.productId, input.productId) : undefined,
    input.status ? eq(card.status, input.status) : undefined,
    batchNo ? like(card.batchNo, `%${batchNo}%`) : undefined,
    input.startDate ? gte(card.createdAt, parseDateBoundary(input.startDate, timezone, false)) : undefined,
    input.endDate ? lt(card.createdAt, parseDateBoundary(input.endDate, timezone, true)) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totals, products, allCards, availableCards, soldCards] = await Promise.all([
    db
      .select({
        id: card.id,
        productId: card.productId,
        productName: productV2.name,
        productSkuName: productSku.name,
        content: card.content,
        status: card.status,
        batchNo: card.batchNo,
        orderId: card.orderId,
        soldAt: card.soldAt,
        createdAt: card.createdAt,
      })
      .from(card)
      .innerJoin(productV2, eq(card.productId, productV2.id))
      .leftJoin(productSku, eq(card.productSkuId, productSku.id))
      .where(where)
      .orderBy(desc(card.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: count() }).from(card).where(where),
    db
      .selectDistinct({ id: productV2.id, name: productV2.name })
      .from(productV2)
      .innerJoin(productSku, and(eq(productSku.productId, productV2.id), eq(productSku.deliveryType, "CARD_AUTO"), eq(productSku.status, "ACTIVE")))
      .orderBy(asc(productV2.sort), asc(productV2.id)),
    db.select({ count: count() }).from(card),
    db.select({ count: count() }).from(card).where(eq(card.status, "UNUSED")),
    db.select({ count: count() }).from(card).where(eq(card.status, "SOLD")),
  ]);

  return {
    items: rows.map(({ content, ...item }) => ({ ...item, contentPreview: previewCard(content) })),
    total: totals[0]?.count ?? 0,
    page,
    pageSize,
    products: await Promise.all(products.map(async (item) => ({
      ...item,
      skus: await db.select({ id: productSku.id, name: productSku.name })
        .from(productSku).where(and(eq(productSku.productId, item.id), eq(productSku.deliveryType, "CARD_AUTO"), eq(productSku.status, "ACTIVE")))
        .orderBy(asc(productSku.sort), asc(productSku.id)),
    }))),
    overview: {
      total: allCards[0]?.count ?? 0,
      available: availableCards[0]?.count ?? 0,
      sold: soldCards[0]?.count ?? 0,
    },
  };
}

async function internalOnCreateCard(input: { productId: number; productSkuId: number; content: string; batchNo?: string }) {
  const { db } = getAdminDb();
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  const productSkuId = await resolveCardSku(db, productId, input.productSkuId);
  const content = input.content.trim();
  if (!content) appError("CARD_CONTENT_REQUIRED");
  const batchNo = input.batchNo?.trim() || null;
  const now = new Date();
  const [created] = await db.insert(card).values({
    productId,
    productSkuId,
    content,
    status: "UNUSED",
    batchNo,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: card.id });
  return created;
}

async function internalOnImportCards(input: { productId: number; productSkuId: number; content: string; batchNo?: string }) {
  const { db } = getAdminDb();
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  const productSkuId = await resolveCardSku(db, productId, input.productSkuId);
  const contents = [...new Set(input.content.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
  if (!contents.length) appError("CARD_CONTENT_REQUIRED");
  if (contents.length > 1000) appError("CARD_IMPORT_LIMIT_EXCEEDED");

  const now = new Date();
  const batchNo = input.batchNo?.trim() || null;
  await db.insert(card).values(contents.map((content) => ({
    productId,
    productSkuId,
    content,
    status: "UNUSED" as const,
    batchNo,
    createdAt: now,
    updatedAt: now,
  })));
  return { imported: contents.length };
}

async function internalOnDeleteCard(input: { id: number }) {
  const { db } = getAdminDb();
  const id = positiveInteger(input.id, "CARD_ID");
  const [deleted] = await db.delete(card)
    .where(and(eq(card.id, id), eq(card.status, "UNUSED")))
    .returning({ id: card.id });
  if (!deleted) appError("CARD_DELETE_REJECTED");
  return deleted;
}

async function internalOnDeleteUnusedCards(input: { productId: number }) {
  const { db } = getAdminDb();
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  await assertCardProduct(db, productId);
  const deleted = await db.delete(card)
    .where(and(eq(card.productId, productId), eq(card.status, "UNUSED")))
    .returning({ id: card.id });
  return { deleted: deleted.length };
}

export const onGetCardAdminData = telefuncAction(internalOnGetCardAdminData);
export const onCreateCard = telefuncAction(internalOnCreateCard);
export const onImportCards = telefuncAction(internalOnImportCards);
export const onDeleteCard = telefuncAction(internalOnDeleteCard);
export const onDeleteUnusedCards = telefuncAction(internalOnDeleteUnusedCards);
