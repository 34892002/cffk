import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { supplierAccount, supplierBinding } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { isSupplierAccountFailure } from "./error";
import { createSupplierAdapter } from "./providers/factory";
import { supplierPurchaseContextSchema } from "./schema";
import type { SupplierDb } from "./import";
import { createDrizzleDb } from "@/database/drizzle";

function supplierErrorDetails(cause: unknown) {
  if (cause instanceof Error) {
    const value = cause as Error & { code?: unknown; status?: unknown };
    return { name: value.name, message: value.message, code: value.code, status: value.status, stack: value.stack };
  }
  return { value: cause };
}

async function refreshSupplierSkuForPublication(db: SupplierDb, productSkuId: number) {
  const [binding] = await db.select().from(supplierBinding).where(and(eq(supplierBinding.productSkuId, productSkuId), eq(supplierBinding.enabled, true))).limit(1);
  if (!binding) {
    console.error("[supplier][publication] binding not found", { productSkuId });
    appError("SUPPLIER_BINDING_NOT_FOUND");
  }

  const now = new Date();
  const accounts = await db.select().from(supplierAccount).where(and(
    eq(supplierAccount.provider, binding.provider),
    eq(supplierAccount.normalizedApiOrigin, binding.normalizedApiOrigin),
    eq(supplierAccount.protocolVersion, binding.protocolVersion),
    eq(supplierAccount.enabled, true),
    or(isNull(supplierAccount.cooldownUntil), lte(supplierAccount.cooldownUntil, now)),
  ));
  if (!accounts.length) {
    console.error("[supplier][publication] no available accounts", {
      productSkuId,
      bindingId: binding.id,
      provider: binding.provider,
      normalizedApiOrigin: binding.normalizedApiOrigin,
      protocolVersion: binding.protocolVersion,
    });
    appError("SUPPLIER_PURCHASE_UNAVAILABLE");
  }

  const refreshedAccountIds: string[] = [];
  let remoteSku: Awaited<ReturnType<ReturnType<typeof createSupplierAdapter>["getSku"]>> | undefined;
  for (const account of accounts) {
    try {
      const adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: account.protocolVersion, baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
      const connection = await adapter.testConnection();
      await db.update(supplierAccount).set({ balanceMinor: connection.balance.amountMinor, balanceSyncedAt: now, healthStatus: "healthy", consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, lastSelectedAt: now, updatedAt: now }).where(eq(supplierAccount.id, account.id));
      refreshedAccountIds.push(account.id);
      if (!remoteSku) remoteSku = await adapter.getSku(binding.upstreamProductId, binding.upstreamSkuId);
    } catch (cause) {
      console.error("[supplier][publication] account refresh failed", {
        productSkuId,
        bindingId: binding.id,
        accountId: account.id,
        provider: account.provider,
        normalizedApiOrigin: account.normalizedApiOrigin,
        protocolVersion: account.protocolVersion,
        error: supplierErrorDetails(cause),
      });
      if (isSupplierAccountFailure(cause)) {
        await db.update(supplierAccount).set({ healthStatus: "degraded", consecutiveFailures: account.consecutiveFailures + 1, cooldownUntil: new Date(Date.now() + 5 * 60 * 1000), lastErrorCode: "supplier_publication_refresh_failed", lastErrorAt: now, updatedAt: now }).where(eq(supplierAccount.id, account.id));
      }
    }
  }
  if (!remoteSku) {
    console.error("[supplier][publication] all account refreshes failed", {
      productSkuId,
      bindingId: binding.id,
      provider: binding.provider,
      normalizedApiOrigin: binding.normalizedApiOrigin,
      protocolVersion: binding.protocolVersion,
    });
    appError("SUPPLIER_SOURCE_REFRESH_FAILED");
  }

  const purchaseContext = remoteSku.purchaseContext ? supplierPurchaseContextSchema.parse(remoteSku.purchaseContext) : null;
  const [refreshedBinding] = await db.update(supplierBinding).set({
    upstreamSkuName: remoteSku.name,
    purchaseContextJson: purchaseContext ? JSON.stringify(purchaseContext) : null,
    referenceCostMinor: remoteSku.costMinor,
    stockQuantity: remoteSku.stockQuantity,
    remoteStatus: remoteSku.active ? "active" : "inactive",
    lastSyncedAt: now,
    lastErrorCode: null,
    updatedAt: now,
  }).where(eq(supplierBinding.id, binding.id)).returning();
  if (!refreshedBinding) appError("SUPPLIER_BINDING_NOT_FOUND");
  return { binding: refreshedBinding, refreshedAccountIds };
}

export async function assertSupplierSkuPublishable(db: SupplierDb, productSkuId: number, quantity = 1) {
  const { binding, refreshedAccountIds } = await refreshSupplierSkuForPublication(db, productSkuId);
  if (binding.remoteStatus !== "active") {
    console.error("[supplier][publication] SKU unavailable upstream", { productSkuId, bindingId: binding.id, upstreamProductId: binding.upstreamProductId, upstreamSkuId: binding.upstreamSkuId, remoteStatus: binding.remoteStatus, stockQuantity: binding.stockQuantity });
    appError("SUPPLIER_SKU_UNAVAILABLE");
  }
  if (binding.stockQuantity < quantity) {
    console.error("[supplier][publication] insufficient upstream stock", { productSkuId, bindingId: binding.id, stockQuantity: binding.stockQuantity, quantity });
    appError("SUPPLIER_STOCK_NOT_ENOUGH");
  }

  const requiredCost = BigInt(binding.referenceCostMinor) * BigInt(quantity);
  const accounts = refreshedAccountIds.length
    ? await db.select().from(supplierAccount).where(inArray(supplierAccount.id, refreshedAccountIds))
    : [];
  const account = accounts.find((candidate) =>
    candidate.balanceMinor !== null
    && BigInt(candidate.balanceMinor) - BigInt(candidate.reserveBalanceMinor) >= requiredCost
    && (candidate.maxOrderCostMinor === null || requiredCost <= BigInt(candidate.maxOrderCostMinor)),
  );
  if (!account) {
    const hasSufficientBalance = accounts.some((candidate) =>
      candidate.balanceMinor !== null
      && BigInt(candidate.balanceMinor) - BigInt(candidate.reserveBalanceMinor) >= requiredCost,
    );
    const hasAccountCostLimit = accounts.some((candidate) =>
      candidate.maxOrderCostMinor !== null && requiredCost > BigInt(candidate.maxOrderCostMinor),
    );
    console.error("[supplier][publication] no account passes balance/cost checks", {
      productSkuId,
      bindingId: binding.id,
      provider: binding.provider,
      upstreamProductId: binding.upstreamProductId,
      upstreamSkuId: binding.upstreamSkuId,
      requiredCostMinor: requiredCost.toString(),
      referenceCostMinor: binding.referenceCostMinor,
      maxCostMinor: binding.maxCostMinor,
      hasSufficientBalance,
      hasAccountCostLimit,
      accounts: accounts.map((candidate) => ({ id: candidate.id, balanceMinor: candidate.balanceMinor, reserveBalanceMinor: candidate.reserveBalanceMinor, maxOrderCostMinor: candidate.maxOrderCostMinor, currency: candidate.currency })),
    });
    if (!hasSufficientBalance) appError("SUPPLIER_BALANCE_INSUFFICIENT");
    if (hasAccountCostLimit) appError("SUPPLIER_ACCOUNT_COST_LIMIT");
    appError("SUPPLIER_PURCHASE_UNAVAILABLE");
  }
  if (BigInt(binding.referenceCostMinor) > BigInt(binding.maxCostMinor)) {
    console.error("[supplier][publication] supplier cost limit exceeded", { productSkuId, bindingId: binding.id, referenceCostMinor: binding.referenceCostMinor, maxCostMinor: binding.maxCostMinor });
    appError("SUPPLIER_COST_LIMIT_EXCEEDED");
  }
  return { binding, account };
}

/**
 * Performs the live quote check before payment is confirmed. Publication checks
 * the catalog price, but ACG's valuation endpoint is the authoritative price
 * used by the purchase request and can differ from factory_price.
 */
export async function assertSupplierSkuOrderable(database: D1Database, productSkuId: number, quantity = 1) {
  const db = createDrizzleDb(database);
  const [binding] = await db.select().from(supplierBinding).where(and(eq(supplierBinding.productSkuId, productSkuId), eq(supplierBinding.enabled, true))).limit(1);
  if (!binding) appError("SUPPLIER_BINDING_NOT_FOUND");
  const sourceAccounts = await db.select().from(supplierAccount).where(and(
    eq(supplierAccount.provider, binding.provider),
    eq(supplierAccount.normalizedApiOrigin, binding.normalizedApiOrigin),
    eq(supplierAccount.protocolVersion, binding.protocolVersion),
    eq(supplierAccount.enabled, true),
  ));
  if (!sourceAccounts.length) {
    console.error("[supplier][eligibility] no enabled supplier account", { productSkuId, provider: binding.provider, bindingId: binding.id, normalizedApiOrigin: binding.normalizedApiOrigin, protocolVersion: binding.protocolVersion });
    appError("SUPPLIER_ACCOUNT_DISABLED");
  }
  const now = new Date();
  const accounts = sourceAccounts.filter((account) => account.cooldownUntil === null || account.cooldownUntil.getTime() <= now.getTime());
  if (!accounts.length) {
    console.error("[supplier][eligibility] all supplier accounts are cooling down", { productSkuId, provider: binding.provider, bindingId: binding.id, accounts: sourceAccounts.map((account) => ({ id: account.id, enabled: account.enabled, healthStatus: account.healthStatus, cooldownUntil: account.cooldownUntil, lastErrorCode: account.lastErrorCode })) });
    appError("SUPPLIER_ACCOUNT_COOLDOWN");
  }

  let lastError: unknown;
  for (const account of accounts) {
    try {
      const adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: account.protocolVersion, baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
      const [connection, remoteSku] = await Promise.all([
        adapter.testConnection(),
        adapter.getSku(binding.upstreamProductId, binding.upstreamSkuId),
      ]);
      if (!remoteSku.active) appError("SUPPLIER_SKU_UNAVAILABLE");
      if (remoteSku.stockQuantity < quantity) appError("SUPPLIER_STOCK_NOT_ENOUGH");
      const context = remoteSku.purchaseContext
        ? supplierPurchaseContextSchema.parse(remoteSku.purchaseContext)
        : binding.purchaseContextJson
          ? supplierPurchaseContextSchema.parse(JSON.parse(binding.purchaseContextJson))
          : undefined;
      if (remoteSku.purchaseContext && JSON.stringify(remoteSku.purchaseContext) !== binding.purchaseContextJson) {
        await db.update(supplierBinding).set({ purchaseContextJson: JSON.stringify(remoteSku.purchaseContext), updatedAt: new Date() }).where(eq(supplierBinding.id, binding.id));
      }
      if (!adapter.quote) return { binding, account };
      const quote = await adapter.quote({ skuId: binding.upstreamSkuId, quantity, purchaseContext: context });
      const total = BigInt(quote.totalCostMinor);
      if (BigInt(quote.unitCostMinor) > BigInt(binding.maxCostMinor)) appError("SUPPLIER_COST_LIMIT_EXCEEDED");
      if (account.maxOrderCostMinor !== null && total > BigInt(account.maxOrderCostMinor)) appError("SUPPLIER_ACCOUNT_COST_LIMIT");
      if (BigInt(connection.balance.amountMinor) - BigInt(account.reserveBalanceMinor) < total) appError("SUPPLIER_BALANCE_INSUFFICIENT");
      return { binding, account, quote };
    } catch (cause) {
      lastError = cause;
      const code = typeof cause === "object" && cause && "code" in cause && typeof cause.code === "string"
        ? cause.code
        : cause instanceof Error ? cause.message : "supplier_purchase_unavailable";
      console.error("[supplier][eligibility] orderability check failed", {
        productSkuId,
        quantity,
        provider: binding.provider,
        bindingId: binding.id,
        accountId: account.id,
        code,
        error: cause,
      });
      if (isSupplierAccountFailure(cause)) {
        await db.update(supplierAccount).set({
          healthStatus: "degraded",
          consecutiveFailures: account.consecutiveFailures + 1,
          cooldownUntil: new Date(Date.now() + 5 * 60 * 1000),
          lastErrorCode: code,
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(supplierAccount.id, account.id));
      }
      if (typeof cause === "object" && cause && "code" in cause) throw cause;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("supplier_purchase_unavailable");
}
