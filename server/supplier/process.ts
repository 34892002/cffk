import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order, siteSetting, supplierAccount, supplierBinding, supplierOrder } from "@/database/drizzle/schema";
import { createSupplierAdapter } from "./providers/factory";
import { enqueueOrderEvent } from "@/server/email/order-events";
import { normalizeLegacyProtocolVersion, supplierOrderStateSchema } from "./schema";
import { isSupplierAccountFailureCode } from "./error";


const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_AUTOMATIC_ATTEMPTS = 5;

type Runtime = Record<string, unknown>;

function errorCode(cause: unknown) {
  return typeof cause === "object" && cause && "code" in cause && typeof cause.code === "string" ? cause.code : cause instanceof Error ? cause.message : "supplier_purchase_failed";
}

function isBusinessQuoteFailure(code: string) {
  return [
    "supplier_stock_insufficient",
    "supplier_binding_cost_limit",
    "supplier_account_cost_limit",
    "supplier_balance_insufficient",
    "supplier_live_quote_exceeds_limit",
  ].includes(code);
}

function isNonNegativeMinor(value: string) {
  return /^(0|[1-9]\d*)$/.test(value);
}

async function chooseAccount(db: ReturnType<typeof createDrizzleDb>, binding: typeof supplierBinding.$inferSelect, excludedAccountId?: string | null) {
  const now = new Date();
  const candidates = await db.select().from(supplierAccount).where(and(eq(supplierAccount.provider, binding.provider), eq(supplierAccount.normalizedApiOrigin, binding.normalizedApiOrigin), eq(supplierAccount.enabled, true), or(isNull(supplierAccount.cooldownUntil), lte(supplierAccount.cooldownUntil, now)))).orderBy(asc(supplierAccount.lastSelectedAt), asc(supplierAccount.id)).limit(20);
  return candidates.find((account) => account.id !== excludedAccountId && normalizeLegacyProtocolVersion(account.provider, account.protocolVersion) === normalizeLegacyProtocolVersion(binding.provider, binding.protocolVersion)) ?? null;
}

function quote(binding: typeof supplierBinding.$inferSelect, account: typeof supplierAccount.$inferSelect, quantity: number) {
  const unitCostMinor = BigInt(binding.referenceCostMinor);
  const totalCostMinor = unitCostMinor * BigInt(quantity);
  if (binding.remoteStatus !== "active" || binding.stockQuantity < quantity) throw new Error("supplier_stock_insufficient");
  if (unitCostMinor > BigInt(binding.maxCostMinor)) throw new Error("supplier_binding_cost_limit");
  if (account.maxOrderCostMinor !== null && totalCostMinor > BigInt(account.maxOrderCostMinor)) throw new Error("supplier_account_cost_limit");
  if (account.balanceMinor === null || BigInt(account.balanceMinor) - BigInt(account.reserveBalanceMinor) < totalCostMinor) throw new Error("supplier_balance_insufficient");
  return { unitCostMinor: unitCostMinor.toString(), totalCostMinor: totalCostMinor.toString() };
}

async function markAccountSuccess(db: ReturnType<typeof createDrizzleDb>, accountId: string) {
  await db.update(supplierAccount).set({ healthStatus: "healthy", consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, cooldownUntil: null, lastSelectedAt: new Date(), updatedAt: new Date() }).where(eq(supplierAccount.id, accountId));
}

async function markAccountFailure(db: ReturnType<typeof createDrizzleDb>, accountId: string, code: string) {
  if (!isSupplierAccountFailureCode(code)) return;
  const now = new Date();
  await db.update(supplierAccount).set({ healthStatus: "degraded", consecutiveFailures: sql`${supplierAccount.consecutiveFailures} + 1`, lastErrorCode: code, lastErrorAt: now, cooldownUntil: new Date(now.getTime() + RETRY_DELAY_MS), updatedAt: now }).where(eq(supplierAccount.id, accountId));
}

async function reserveSupplierFunds(database: D1Database, taskId: number, accountId: string, totalCostMinor: string) {
  const amount = BigInt(totalCostMinor);
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("supplier_cost_invalid");
  const amountNumber = Number(amount);
  const now = Date.now();
  const reserved = await database.prepare("UPDATE supplierAccount SET reserveBalanceMinor = CAST(reserveBalanceMinor AS INTEGER) + ?, updatedAt = ? WHERE id = ? AND enabled = 1 AND balanceMinor IS NOT NULL AND CAST(balanceMinor AS INTEGER) >= CAST(reserveBalanceMinor AS INTEGER) + ?").bind(amountNumber, now, accountId, amountNumber).run();
  if (Number(reserved.meta.changes) !== 1) throw new Error("supplier_balance_insufficient");
  const claimed = await database.prepare("UPDATE supplierOrder SET accountLockedAt = ?, updatedAt = ? WHERE id = ? AND selectedAccountId = ? AND accountLockedAt IS NULL AND state IN ('pending', 'failed') AND upstreamOrderId IS NULL").bind(now, now, taskId, accountId).run();
  if (Number(claimed.meta.changes) !== 1) {
    await releaseSupplierFunds(database, accountId, totalCostMinor);
    throw new Error("supplier_order_claim_conflict");
  }
}

async function releaseSupplierFunds(database: D1Database, accountId: string | null, totalCostMinor: string | null) {
  if (!accountId || !totalCostMinor) return;
  await database.prepare("UPDATE supplierAccount SET reserveBalanceMinor = MAX(0, CAST(reserveBalanceMinor AS INTEGER) - ?), updatedAt = ? WHERE id = ?").bind(totalCostMinor, Date.now(), accountId).run();
}

export async function completeSupplierOrderFromCallback(database: D1Database, supplierOrderId: number, upstreamOrderId: string, cards: string[]) {
  const db = createDrizzleDb(database);
  const [task] = await db.select({ task: supplierOrder, fulfillmentSource: order.fulfillmentSourceSnapshot }).from(supplierOrder).innerJoin(order, eq(order.id, supplierOrder.orderId)).where(eq(supplierOrder.id, supplierOrderId)).limit(1);
  if (!task) throw new Error("supplier_order_not_found");
  if (task.fulfillmentSource !== "SUPPLIER") throw new Error("supplier_order_fulfillment_invalid");
  if (task.task.state === "supplied") return { status: "supplied" as const, duplicate: true };
  if (!["submitting", "processing", "uncertain"].includes(task.task.state)) throw new Error("supplier_order_callback_state_invalid");
  await db.update(supplierOrder).set({ upstreamOrderId, updatedAt: new Date() }).where(eq(supplierOrder.id, supplierOrderId));
  const latest = (await db.select().from(supplierOrder).where(eq(supplierOrder.id, supplierOrderId)).limit(1))[0]!;
  await fulfillSupplierOrder(database, latest, cards);
  return { status: "supplied" as const, duplicate: false };
}

async function fulfillSupplierOrder(database: D1Database, task: typeof supplierOrder.$inferSelect, cards: string[]) {
  const now = Date.now();
  const content = JSON.stringify(cards);
  await database.batch([
    database.prepare("INSERT INTO orderDelivery (orderId, deliveryType, attemptToken, contentSnapshot, errorCode, status, createdAt) SELECT id, 'SUPPLIER', ?, ?, NULL, 'SUCCESS', ? FROM `order` WHERE id = ? AND fulfillmentSourceSnapshot = 'SUPPLIER' AND NOT EXISTS (SELECT 1 FROM orderDelivery WHERE attemptToken = ?)").bind(`supplier:${task.id}`, content, now, task.orderId, `supplier:${task.id}`),
    database.prepare("UPDATE `order` SET status = 'DELIVERED', deliveryStatus = 'DELIVERED', deliveredAt = ?, updatedAt = ? WHERE id = ? AND paymentStatus = 'PAID' AND fulfillmentSourceSnapshot = 'SUPPLIER' AND deliveryStatus != 'DELIVERED'").bind(now, now, task.orderId),
    database.prepare("UPDATE supplierOrder SET deliveryRecordId = (SELECT id FROM orderDelivery WHERE attemptToken = ?), state = 'supplied', suppliedAt = ?, lastErrorCode = NULL, lastErrorMessage = NULL, updatedAt = ? WHERE id = ? AND state IN ('submitting', 'processing', 'uncertain')").bind(`supplier:${task.id}`, now, now, task.id),
    database.prepare("UPDATE supplierAccount SET reserveBalanceMinor = MAX(0, CAST(reserveBalanceMinor AS INTEGER) - CAST(COALESCE((SELECT totalCostMinor FROM supplierOrder WHERE id = ?), '0') AS INTEGER)), updatedAt = ? WHERE id = ?").bind(task.id, now, task.selectedAccountId),
  ]);
  await enqueueOrderEvent(database, { eventKey: `delivery-success:supplier:${task.id}`, orderId: task.orderId, scene: "DELIVERY_SUCCESS" });
}

export async function processSupplierOrder(database: D1Database, supplierOrderId: number, _runtime: Runtime = {}) {
  const db = createDrizzleDb(database);
  const [loaded] = await db.select({ task: supplierOrder, fulfillmentSource: order.fulfillmentSourceSnapshot }).from(supplierOrder).innerJoin(order, eq(order.id, supplierOrder.orderId)).where(eq(supplierOrder.id, supplierOrderId)).limit(1);
  if (!loaded) return { status: "missing" as const };
  const task = loaded.task;
  if (loaded.fulfillmentSource !== "SUPPLIER") return failTask(db, task.id, "supplier_order_fulfillment_invalid", true);
  if (supplierOrderStateSchema.safeParse(task.state).success && ["supplied", "refunded"].includes(task.state)) return { status: task.state as "supplied" | "refunded" };
  if (task.state === "uncertain" && !task.upstreamOrderId) return { status: "uncertain" as const, errorCode: task.lastErrorCode ?? "supplier_request_uncertain" };
  if (task.attemptCount >= MAX_AUTOMATIC_ATTEMPTS && ["pending", "failed"].includes(task.state)) return failTask(db, task.id, "supplier_retry_exhausted", true);
  const [binding] = await db.select().from(supplierBinding).where(eq(supplierBinding.id, task.supplierBindingId)).limit(1);
  if (!binding) return failTask(db, task.id, "supplier_binding_missing");
  const account = task.upstreamOrderId
    ? (await db.select().from(supplierAccount).where(eq(supplierAccount.id, task.selectedAccountId ?? "")).limit(1))[0] ?? null
    : await chooseAccount(db, binding, task.accountLockedAt ? task.selectedAccountId : null);
  if (!account) return failTask(db, task.id, task.upstreamOrderId ? "supplier_reconcile_account_unavailable" : "supplier_account_unavailable");
  let snapshot: { upstreamProductId?: string; upstreamSkuId: string; purchaseContextJson?: string | null };
  try {
    const parsed = JSON.parse(task.bindingSnapshotJson) as unknown;
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { upstreamSkuId?: unknown }).upstreamSkuId !== "string") throw new Error("supplier_binding_snapshot_invalid");
    snapshot = parsed as { upstreamProductId?: string; upstreamSkuId: string; purchaseContextJson?: string | null };
  } catch {
    return failTask(db, task.id, "supplier_binding_snapshot_invalid", true);
  }
  let purchaseContext;
  if (snapshot.purchaseContextJson) {
    try { purchaseContext = JSON.parse(snapshot.purchaseContextJson); } catch { return failTask(db, task.id, "supplier_purchase_context_invalid", true); }
  }
  const requestNo = task.providerRequestNo ?? `cffk-${task.id}-${task.orderId}`;
  const callbackUrl = await supplierCallbackUrl(db, account.id);
  let adapter;
  try {
    adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: normalizeLegacyProtocolVersion(account.provider, account.protocolVersion), baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
  } catch (cause) {
    return failTask(db, task.id, errorCode(cause), true);
  }
  let quoteResult: { unitCostMinor: string; totalCostMinor: string };
  if (task.upstreamOrderId) {
    quoteResult = { unitCostMinor: task.quotedUnitCostMinor ?? binding.referenceCostMinor, totalCostMinor: task.totalCostMinor ?? (BigInt(binding.referenceCostMinor) * BigInt(task.quantity)).toString() };
  } else {
    try {
      const [connection, remoteSku] = await Promise.all([
        adapter.testConnection(),
        adapter.getSku(snapshot.upstreamProductId ?? snapshot.upstreamSkuId, snapshot.upstreamSkuId),
      ]);
      await db.update(supplierAccount).set({ balanceMinor: connection.balance.amountMinor, balanceSyncedAt: new Date(), healthStatus: "healthy", consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, updatedAt: new Date() }).where(eq(supplierAccount.id, account.id));
      const liveAccount = { ...account, balanceMinor: connection.balance.amountMinor };
      if (!remoteSku.active || remoteSku.stockQuantity < task.quantity) throw new Error("supplier_stock_insufficient");
      if (BigInt(remoteSku.costMinor) > BigInt(binding.maxCostMinor)) throw new Error("supplier_live_quote_exceeds_limit");
      quoteResult = quote({ ...binding, referenceCostMinor: remoteSku.costMinor }, liveAccount, task.quantity);
      if (adapter.quote) {
        try {
          const liveQuote = await adapter.quote({ skuId: snapshot.upstreamSkuId, quantity: task.quantity, purchaseContext });
          if (!isNonNegativeMinor(liveQuote.unitCostMinor) || !isNonNegativeMinor(liveQuote.totalCostMinor)) throw new Error("supplier_live_quote_invalid");
          if (BigInt(liveQuote.unitCostMinor) > BigInt(binding.maxCostMinor)) throw new Error("supplier_live_quote_exceeds_limit");
          if (BigInt(liveQuote.totalCostMinor) > BigInt(account.maxOrderCostMinor ?? liveQuote.totalCostMinor)) throw new Error("supplier_account_cost_limit");
          if (BigInt(connection.balance.amountMinor) - BigInt(account.reserveBalanceMinor) < BigInt(liveQuote.totalCostMinor)) throw new Error("supplier_balance_insufficient");
          quoteResult = liveQuote;
        } catch (cause) {
          const code = errorCode(cause);
          if (!isBusinessQuoteFailure(code)) await markAccountFailure(db, account.id, code);
          return failTask(db, task.id, code);
        }
      }
    } catch (cause) {
      const code = errorCode(cause);
      if (code !== "supplier_stock_insufficient" && code !== "supplier_live_quote_exceeds_limit" && code !== "supplier_balance_insufficient" && code !== "supplier_account_cost_limit") await markAccountFailure(db, account.id, code);
      return failTask(db, task.id, code);
    }
  }
  if (!task.upstreamOrderId) {
    await db.update(supplierOrder).set({ selectedAccountId: account.id, selectedCredentialsRevision: account.credentialsRevision, providerRequestNo: requestNo, quotedUnitCostMinor: quoteResult.unitCostMinor, totalCostMinor: quoteResult.totalCostMinor, state: "pending", selectionCount: task.selectionCount + (task.selectedAccountId === account.id ? 0 : 1), updatedAt: new Date() }).where(eq(supplierOrder.id, task.id));
    try {
      await reserveSupplierFunds(database, task.id, account.id, quoteResult.totalCostMinor);
    } catch (cause) {
      const code = errorCode(cause);
      await db.update(supplierOrder).set({ selectedAccountId: null, selectedCredentialsRevision: null, accountLockedAt: null, providerRequestNo: null, quotedUnitCostMinor: null, totalCostMinor: null, updatedAt: new Date() }).where(and(eq(supplierOrder.id, task.id), isNull(supplierOrder.upstreamOrderId)));
      await markAccountFailure(db, account.id, code);
      return failTask(db, task.id, code);
    }
  }
  await db.update(supplierOrder).set({ selectedAccountId: account.id, selectedCredentialsRevision: account.credentialsRevision, providerRequestNo: requestNo, quotedUnitCostMinor: quoteResult.unitCostMinor, totalCostMinor: quoteResult.totalCostMinor, state: task.upstreamOrderId ? "processing" : "submitting", attemptCount: task.attemptCount + 1, selectionCount: task.selectionCount + (task.selectedAccountId === account.id ? 0 : 1), accountLockedAt: new Date(), submittedAt: task.upstreamOrderId ? undefined : new Date(), updatedAt: new Date() }).where(eq(supplierOrder.id, task.id));
  try {
    const result = task.upstreamOrderId
      ? await adapter.reconcileOrder({ upstreamOrderId: task.upstreamOrderId, skuId: snapshot.upstreamSkuId, quantity: task.quantity, requestNo, callbackUrl, traceId: `supplier-order-${task.id}`, purchaseContext })
      : await adapter.submitOrder({ skuId: snapshot.upstreamSkuId, quantity: task.quantity, requestNo, callbackUrl, traceId: `supplier-order-${task.id}`, purchaseContext });
    if (result.status === "supplied") {
      await markAccountSuccess(db, account.id);
      await db.update(supplierOrder).set({ upstreamOrderId: result.upstreamOrderId, updatedAt: new Date() }).where(eq(supplierOrder.id, task.id));
      const latest = (await db.select().from(supplierOrder).where(eq(supplierOrder.id, task.id)).limit(1))[0]!;
      await fulfillSupplierOrder(database, latest, result.cards);
      return { status: "supplied" as const };
    }
    if (result.status === "processing") {
      await markAccountSuccess(db, account.id);
      await db.update(supplierOrder).set({ upstreamOrderId: result.upstreamOrderId, state: "processing", nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS), lastErrorCode: null, updatedAt: new Date() }).where(eq(supplierOrder.id, task.id));
      return { status: "processing" as const };
    }
    if (result.status === "uncertain") {
      if (result.upstreamOrderId) {
        await db.update(supplierOrder).set({ upstreamOrderId: result.upstreamOrderId, state: "uncertain", nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS), lastErrorCode: result.errorCode, lastErrorMessage: result.errorCode, updatedAt: new Date() }).where(eq(supplierOrder.id, task.id));
      } else {
        await db.update(supplierOrder).set({ state: "uncertain", nextRetryAt: null, lastErrorCode: result.errorCode, lastErrorMessage: result.errorCode, updatedAt: new Date() }).where(eq(supplierOrder.id, task.id));
      }
      return { status: "uncertain" as const, errorCode: result.errorCode };
    }
    await releaseSupplierFunds(database, account.id, task.totalCostMinor ?? quoteResult.totalCostMinor);
    await markAccountFailure(db, account.id, result.errorCode);
    await db.update(supplierOrder).set({ selectedAccountId: null, selectedCredentialsRevision: null, accountLockedAt: null, providerRequestNo: null, quotedUnitCostMinor: null, totalCostMinor: null, updatedAt: new Date() }).where(and(eq(supplierOrder.id, task.id), isNull(supplierOrder.upstreamOrderId)));
    return failTask(db, task.id, result.errorCode);
  } catch (cause) {
    const code = errorCode(cause);
    console.error("[supplier][process] supplier fulfillment failed", {
      supplierOrderId: task.id,
      orderId: task.orderId,
      accountId: account.id,
      upstreamOrderId: task.upstreamOrderId,
      code,
      error: cause,
    });
    if (!task.upstreamOrderId) {
      await releaseSupplierFunds(database, account.id, task.totalCostMinor ?? quoteResult.totalCostMinor);
      await db.update(supplierOrder).set({ selectedAccountId: null, selectedCredentialsRevision: null, accountLockedAt: null, providerRequestNo: null, quotedUnitCostMinor: null, totalCostMinor: null, updatedAt: new Date() }).where(and(eq(supplierOrder.id, task.id), isNull(supplierOrder.upstreamOrderId)));
    }
    await markAccountFailure(db, account.id, code);
    if (task.upstreamOrderId) return uncertainTask(db, task.id, code);
    return failTask(db, task.id, code);
  }
}

async function supplierCallbackUrl(db: ReturnType<typeof createDrizzleDb>, accountId: string) {
  const [settings] = await db.select({ siteUrl: siteSetting.siteUrl }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  if (!settings?.siteUrl) return "";
  try {
    const siteUrl = new URL(settings.siteUrl);
    return `${siteUrl.origin}/api/suppliers/dujiao-next/callback/${encodeURIComponent(accountId)}`;
  } catch {
    return "";
  }
}

async function uncertainTask(db: ReturnType<typeof createDrizzleDb>, id: number, code: string) {
  await db.update(supplierOrder).set({ state: "uncertain", nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS), lastErrorCode: code, lastErrorMessage: code, updatedAt: new Date() }).where(eq(supplierOrder.id, id));
  return { status: "uncertain" as const, errorCode: code };
}

async function failTask(db: ReturnType<typeof createDrizzleDb>, id: number, code: string, exhausted = false) {
  await db.update(supplierOrder).set({ state: "failed", nextRetryAt: exhausted ? null : new Date(Date.now() + RETRY_DELAY_MS), lastErrorCode: code, lastErrorMessage: code, updatedAt: new Date() }).where(eq(supplierOrder.id, id));
  return { status: "failed" as const, errorCode: code };
}

export async function processPendingSupplierOrders(database: D1Database, _runtime: Runtime = {}, limit = 20) {
  const now = new Date();
  const db = createDrizzleDb(database);
  const tasks = await db.select({ id: supplierOrder.id }).from(supplierOrder).where(and(or(eq(supplierOrder.state, "pending"), eq(supplierOrder.state, "processing"), eq(supplierOrder.state, "uncertain"), eq(supplierOrder.state, "failed")), or(isNull(supplierOrder.nextRetryAt), lte(supplierOrder.nextRetryAt, now)))).orderBy(asc(supplierOrder.id)).limit(limit);
  const results = [];
  for (const task of tasks) results.push(await processSupplierOrder(database, task.id));
  return { attempted: results.length, supplied: results.filter((item) => item.status === "supplied").length, failed: results.filter((item) => item.status === "failed").length };
}
