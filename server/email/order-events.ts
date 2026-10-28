import { and, eq, lte, or } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { orderEvent } from "@/database/drizzle/schema";
import { dispatchPush, orderPushVariables } from "@/server/push/service";
import { pushDispatchHandled } from "@/server/push/types";

type EmailRuntime = Record<string, unknown>;
type OrderScene = "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED" | "PAYMENT_EXCEPTION";
const EVENT_LEASE_MS = 5 * 60 * 1000;

export async function enqueueOrderEvent(database: D1Database, input: { eventKey: string; orderId: number; scene: OrderScene; errorMessage?: string }) {
  const now = new Date();
  await createDrizzleDb(database).insert(orderEvent).values({
    eventKey: input.eventKey,
    orderId: input.orderId,
    scene: input.scene,
    errorMessage: input.errorMessage ?? null,
    status: "PENDING",
    attemptCount: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}


async function dispatchEvent(database: D1Database, runtime: EmailRuntime, event: typeof orderEvent.$inferSelect) {
  const orderPayload = await orderPushVariables(database, event.orderId);
  if (!orderPayload) throw new Error("ORDER_PUSH_VARIABLES_UNAVAILABLE");
  const variables = { ...orderPayload.variables, ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}) };
  const source = `order-event:${event.id}`;
  if (event.scene === "DELIVERY_FAILED" || event.scene === "PAYMENT_EXCEPTION") {
    return dispatchPush(database, runtime, { scene: event.scene, messageType: "ADMIN", orderId: event.orderId, variables, locale: "zh-CN", source });
  }
  return (await Promise.all([
    dispatchPush(database, runtime, { scene: event.scene, messageType: "NORMAL", orderId: event.orderId, variables, locale: orderPayload.locale, source }),
    dispatchPush(database, runtime, { scene: event.scene, messageType: "ADMIN", orderId: event.orderId, variables, locale: "zh-CN", source }),
  ])).flat();
}

export type ProcessOrderEventResult = { status: "processed" | "failed" | "busy" | "not_found" | "already_processed"; error?: string };

async function processEvent(database: D1Database, runtime: EmailRuntime, event: typeof orderEvent.$inferSelect, now: Date): Promise<ProcessOrderEventResult> {
  const db = createDrizzleDb(database);
  const leaseUntil = new Date(now.getTime() + EVENT_LEASE_MS);
  const [claimed] = await db.update(orderEvent).set({ status: "PROCESSING", leaseUntil, attemptCount: event.attemptCount + 1, updatedAt: now })
    .where(and(eq(orderEvent.id, event.id), eq(orderEvent.attemptCount, event.attemptCount), or(eq(orderEvent.status, "PENDING"), and(eq(orderEvent.status, "PROCESSING"), lte(orderEvent.leaseUntil, now)))))
    .returning({ id: orderEvent.id });
  if (!claimed) return { status: "busy" };
  try {
    const results = await dispatchEvent(database, runtime, event);
    if (results.some((result) => !pushDispatchHandled(result))) throw new Error("ORDER_EVENT_DISPATCH_NOT_HANDLED");
    await db.update(orderEvent).set({ status: "PROCESSED", leaseUntil: null, updatedAt: new Date() }).where(and(eq(orderEvent.id, event.id), eq(orderEvent.status, "PROCESSING")));
    return { status: "processed" };
  } catch (cause) {
    await db.update(orderEvent).set({ status: "PENDING", leaseUntil: null, availableAt: new Date(now.getTime() + 60_000), updatedAt: new Date() }).where(and(eq(orderEvent.id, event.id), eq(orderEvent.status, "PROCESSING")));
    return { status: "failed", error: cause instanceof Error ? cause.message : "ORDER_EVENT_DISPATCH_FAILED" };
  }
}

/** Process one queued event immediately, used by the admin queue actions. */
export async function processOrderEventById(database: D1Database, runtime: EmailRuntime, id: number, now = new Date()): Promise<ProcessOrderEventResult> {
  if (!Number.isInteger(id) || id < 1) return { status: "not_found" };
  const db = createDrizzleDb(database);
  const [event] = await db.select().from(orderEvent).where(eq(orderEvent.id, id)).limit(1);
  if (!event) return { status: "not_found" };
  if (event.status === "PROCESSED") return { status: "already_processed" };
  return processEvent(database, runtime, event, now);
}

export async function processOrderEvents(database: D1Database, runtime: EmailRuntime, now = new Date(), limit = 50) {
  const db = createDrizzleDb(database);
  const candidates = await db.select().from(orderEvent)
    .where(and(lte(orderEvent.availableAt, now), or(eq(orderEvent.status, "PENDING"), and(eq(orderEvent.status, "PROCESSING"), lte(orderEvent.leaseUntil, now)))))
    .limit(Math.min(100, Math.max(1, limit)));
  let processed = 0;
  let failed = 0;
  for (const event of candidates) {
    const result = await processEvent(database, runtime, event, now);
    if (result.status === "processed") processed += 1;
    else if (result.status === "failed") failed += 1;
  }
  return { attempted: candidates.length, processed, failed };
}

export async function notifyOrderEmailEvents(database: D1Database, runtime: EmailRuntime) {
  await processOrderEvents(database, runtime);
}
