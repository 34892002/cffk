import { and, asc, eq, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";

export async function allocateCardsForPaidOrder(database: D1Database, orderId: number, productId: number, quantity: number, productSkuId?: number | null) {
  const db = createDrizzleDb(database);
  const count = Math.floor(quantity);
  if (!Number.isInteger(count) || count < 1) throw new Error("CARD_QUANTITY_INVALID");

  // A delivery retry can follow a successful allocation whose snapshot write
  // did not complete. Reuse only cards already sold to this exact order.
  const existing = await db
    .select({ id: card.id, content: card.content })
    .from(card)
    .where(and(eq(card.orderId, orderId), eq(card.status, "SOLD")))
    .orderBy(asc(card.id));
  if (existing.length === count) return existing;
  if (existing.length > count) appError("CARD_DELIVERY_COUNT_MISMATCH");
  const missingCount = count - existing.length;

  const candidates = await db
    .select({ id: card.id })
    .from(card)
    .where(and(productSkuId ? eq(card.productSkuId, productSkuId) : eq(card.productId, productId), eq(card.status, "UNUSED")))
    .orderBy(asc(card.id))
    .limit(missingCount);
  if (candidates.length < missingCount) appError("CARD_INVENTORY_SHORTAGE");

  const candidateIds = candidates.map((item) => item.id);
  const now = Date.now();
  try {
    await database.batch([
      database.prepare(`UPDATE card SET status = 'SOLD', orderId = ?, soldAt = ?, updatedAt = ? WHERE id IN (${candidateIds.map(() => "?").join(",")}) AND status = 'UNUSED'`).bind(orderId, now, now, ...candidateIds),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, CASE WHEN changes() = ? THEN 1 ELSE 0 END) ON CONFLICT(id) DO UPDATE SET value = excluded.value").bind(missingCount),
    ]);
  } catch {
    appError("CARD_INVENTORY_SHORTAGE");
  }
  const allocated = await db.select({ id: card.id, content: card.content }).from(card).where(and(eq(card.orderId, orderId), eq(card.status, "SOLD"))).orderBy(asc(card.id));
  if (allocated.length !== count) appError("CARD_DELIVERY_COUNT_MISMATCH");
  return allocated;
}

export async function countAvailableCards(database: D1Database, productId: number, productSkuId?: number | null) {
  const db = createDrizzleDb(database);
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(card)
    .where(and(productSkuId ? eq(card.productSkuId, productSkuId) : eq(card.productId, productId), eq(card.status, "UNUSED")));
  return result?.count ?? 0;
}
