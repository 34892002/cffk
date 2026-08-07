import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card } from "@/database/drizzle/schema";

export class CardInventoryShortageError extends Error {
  constructor() {
    super("CARD_INVENTORY_SHORTAGE");
  }
}

export async function reserveCardsForOrder(database: D1Database, orderId: number, productId: number, quantity: number) {
  const db = createDrizzleDb(database);
  const count = Math.floor(quantity);
  if (!Number.isInteger(count) || count < 1) throw new Error("CARD_QUANTITY_INVALID");

  const candidates = await db
    .select({ id: card.id })
    .from(card)
    .where(and(eq(card.productId, productId), eq(card.status, "UNUSED")))
    .orderBy(asc(card.id))
    .limit(count);

  if (candidates.length < count) throw new CardInventoryShortageError();

  const candidateIds = candidates.map((item) => item.id);
  const reserved = await db
    .update(card)
    .set({ status: "LOCKED", orderId, updatedAt: new Date() })
    .where(and(inArray(card.id, candidateIds), eq(card.status, "UNUSED")))
    .returning({ id: card.id, content: card.content });

  if (reserved.length === count) return reserved;

  // A concurrent buyer claimed at least one selected card. Release only the
  // cards this order successfully reserved, then let the caller retry or fail.
  if (reserved.length) {
    await db
      .update(card)
      .set({ status: "UNUSED", orderId: null, updatedAt: new Date() })
      .where(and(eq(card.orderId, orderId), eq(card.status, "LOCKED")));
  }
  throw new CardInventoryShortageError();
}

export async function getCardsForOrderDelivery(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  return db
    .select({ id: card.id, content: card.content, status: card.status })
    .from(card)
    .where(and(eq(card.orderId, orderId), inArray(card.status, ["LOCKED", "SOLD"])))
    .orderBy(asc(card.id));
}

export async function finalizeReservedCards(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  return db
    .update(card)
    .set({ status: "SOLD", soldAt: new Date(), updatedAt: new Date() })
    .where(and(eq(card.orderId, orderId), eq(card.status, "LOCKED")))
    .returning({ id: card.id, content: card.content });
}

export async function releaseReservedCards(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  return db
    .update(card)
    .set({ status: "UNUSED", orderId: null, updatedAt: new Date() })
    .where(and(eq(card.orderId, orderId), eq(card.status, "LOCKED")))
    .returning({ id: card.id });
}

export async function countAvailableCards(database: D1Database, productId: number) {
  const db = createDrizzleDb(database);
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(card)
    .where(and(eq(card.productId, productId), eq(card.status, "UNUSED")));
  return result?.count ?? 0;
}
