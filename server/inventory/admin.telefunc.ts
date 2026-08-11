import { and, asc, count, desc, eq, gte, like, lt } from "drizzle-orm";
import type { createDrizzleDb } from "@/database/drizzle";
import { requireAdmin } from "@/server/telefunc-context";
import { card, product } from "@/database/drizzle/schema";
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
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field}_INVALID`);
  return value;
}

function previewCard(content: string) {
  return content.length <= 8 ? content : `${content.slice(0, 4)}****${content.slice(-4)}`;
}

function parseDateBoundary(value: string, timezone: string, isEnd: boolean) {
  return dateBoundaryInTimezone(value, timezone, isEnd);
}

async function assertCardProduct(db: ReturnType<typeof createDrizzleDb>, productId: number) {
  const [target] = await db
    .select({ id: product.id, deliveryType: product.deliveryType })
    .from(product)
    .where(eq(product.id, productId))
    .limit(1);
  if (!target) throw new Error("PRODUCT_NOT_FOUND");
  if (target.deliveryType !== "CARD_AUTO") throw new Error("PRODUCT_NOT_CARD_AUTO");
}


export async function onGetCardAdminData(input: CardAdminQuery = {}) {
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
        productName: product.name,
        content: card.content,
        status: card.status,
        batchNo: card.batchNo,
        orderId: card.orderId,
        soldAt: card.soldAt,
        createdAt: card.createdAt,
      })
      .from(card)
      .innerJoin(product, eq(card.productId, product.id))
      .where(where)
      .orderBy(desc(card.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: count() }).from(card).where(where),
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.deliveryType, "CARD_AUTO"))
      .orderBy(asc(product.sort), asc(product.id)),
    db.select({ count: count() }).from(card),
    db.select({ count: count() }).from(card).where(eq(card.status, "UNUSED")),
    db.select({ count: count() }).from(card).where(eq(card.status, "SOLD")),
  ]);

  return {
    items: rows.map(({ content, ...item }) => ({ ...item, contentPreview: previewCard(content) })),
    total: totals[0]?.count ?? 0,
    page,
    pageSize,
    products,
    overview: {
      total: allCards[0]?.count ?? 0,
      available: availableCards[0]?.count ?? 0,
      sold: soldCards[0]?.count ?? 0,
    },
  };
}

export async function onCreateCard(input: { productId: number; content: string; batchNo?: string }) {
  const { db } = getAdminDb();
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  await assertCardProduct(db, productId);
  const content = input.content.trim();
  if (!content) throw new Error("CARD_CONTENT_REQUIRED");
  const batchNo = input.batchNo?.trim() || null;
  const now = new Date();
  const [created] = await db.insert(card).values({
    productId,
    content,
    status: "UNUSED",
    batchNo,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: card.id });
  return created;
}

export async function onImportCards(input: { productId: number; content: string; batchNo?: string }) {
  const { db } = getAdminDb();
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  await assertCardProduct(db, productId);
  const contents = [...new Set(input.content.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
  if (!contents.length) throw new Error("CARD_CONTENT_REQUIRED");
  if (contents.length > 1000) throw new Error("CARD_IMPORT_LIMIT_EXCEEDED");

  const now = new Date();
  const batchNo = input.batchNo?.trim() || null;
  await db.insert(card).values(contents.map((content) => ({
    productId,
    content,
    status: "UNUSED" as const,
    batchNo,
    createdAt: now,
    updatedAt: now,
  })));
  return { imported: contents.length };
}

export async function onDeleteCard(input: { id: number }) {
  const { db } = getAdminDb();
  const id = positiveInteger(input.id, "CARD_ID");
  const [deleted] = await db.delete(card)
    .where(and(eq(card.id, id), eq(card.status, "UNUSED")))
    .returning({ id: card.id });
  if (!deleted) throw new Error("CARD_DELETE_REJECTED");
  return deleted;
}

export async function onDeleteUnusedCards(input: { productId: number }) {
  const { db } = getAdminDb();
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  await assertCardProduct(db, productId);
  const deleted = await db.delete(card)
    .where(and(eq(card.productId, productId), eq(card.status, "UNUSED")))
    .returning({ id: card.id });
  return { deleted: deleted.length };
}
