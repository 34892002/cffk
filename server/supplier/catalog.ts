import { and, asc, eq, like, or } from "drizzle-orm";
import { requireAdmin } from "@/server/telefunc-context";
import { appError } from "@/lib/app-error";
import { productSku, productV2, supplierAccount, supplierBinding, supplierSyncSettings } from "@/database/drizzle/schema";
import { createSupplierAdapter } from "./providers/factory";

import { normalizeLegacyProtocolVersion, supplierPurchaseContextSchema, type SupplierProvider } from "./schema";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

async function ensureSyncSettings(db: ReturnType<typeof requireAdmin>["db"], patch: { lastStartedAt?: Date; lastCompletedAt?: Date | null; lastStatus?: "idle" | "running" | "success" | "failed"; lastError?: string | null }) {
  const [existing] = await db.select({ id: supplierSyncSettings.id }).from(supplierSyncSettings).where(eq(supplierSyncSettings.id, 1)).limit(1);
  if (existing) {
    await db.update(supplierSyncSettings).set({ ...patch, updatedAt: new Date() }).where(eq(supplierSyncSettings.id, 1));
  } else {
    const now = new Date();
    await db.insert(supplierSyncSettings).values({ id: 1, enabled: true, intervalMs: 3_600_000, lastStartedAt: patch.lastStartedAt, lastCompletedAt: patch.lastCompletedAt ?? null, lastStatus: patch.lastStatus ?? "idle", lastError: patch.lastError ?? null, createdAt: now, updatedAt: now });
  }
}

async function availableAccounts(db: ReturnType<typeof requireAdmin>["db"], source?: { provider: SupplierProvider; normalizedApiOrigin: string; protocolVersion?: string }) {
  const conditions = [eq(supplierAccount.enabled, true), source ? eq(supplierAccount.provider, source.provider) : undefined, source ? eq(supplierAccount.normalizedApiOrigin, source.normalizedApiOrigin) : undefined].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const accounts = await db.select().from(supplierAccount).where(and(...conditions)).orderBy(asc(supplierAccount.lastSelectedAt), asc(supplierAccount.id));
  return source?.protocolVersion ? accounts.filter((account) => normalizeLegacyProtocolVersion(account.provider, account.protocolVersion) === source.protocolVersion) : accounts;
}

export async function listSupplierSources() {
  const { db } = requireAdmin();
  const rows = await db.select({ provider: supplierAccount.provider, name: supplierAccount.name, baseUrl: supplierAccount.baseUrl, normalizedApiOrigin: supplierAccount.normalizedApiOrigin, protocolVersion: supplierAccount.protocolVersion, currency: supplierAccount.currency, currencyDecimals: supplierAccount.currencyDecimals }).from(supplierAccount).where(eq(supplierAccount.enabled, true)).orderBy(asc(supplierAccount.provider), asc(supplierAccount.normalizedApiOrigin), asc(supplierAccount.name));
  return [...new Map(rows.map((row) => {
      const protocolVersion = normalizeLegacyProtocolVersion(row.provider, row.protocolVersion);
      const key = `${row.provider}:${row.normalizedApiOrigin}:${protocolVersion}`;
      return [key, { ...row, protocolVersion }] as const;
    })).values()];
}

export async function fetchSupplierCatalog(source: { provider: SupplierProvider; normalizedApiOrigin: string; protocolVersion?: string }, search = "", page = 1, pageSize = DEFAULT_PAGE_SIZE, forceRefresh = false) {
  const { db } = requireAdmin();
  const accounts = await availableAccounts(db, source);
  if (!accounts.length) appError("SUPPLIER_SOURCE_NO_ACCOUNT");
  let lastError: unknown;
  for (const account of accounts) {
    try {
      const adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: normalizeLegacyProtocolVersion(account.provider, account.protocolVersion), baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
      const result = await adapter.listProducts({ page, pageSize: Math.min(pageSize, MAX_PAGE_SIZE), includeInactive: true, forceRefresh });
      const products = await Promise.all(result.products.map(async (product) => ({
        ...product,
        skus: await Promise.all(product.skus.map(async (sku) => {
          if (!adapter.quote) return sku;
          try {
            const quote = await adapter.quote({ skuId: sku.id, quantity: 1, purchaseContext: sku.purchaseContext });
            return { ...sku, livePurchasePriceMinor: quote.unitCostMinor };
          } catch (cause) {
            console.error("[supplier][catalog] live purchase quote failed", { provider: account.provider, accountId: account.id, productId: product.id, skuId: sku.id, error: cause });
            return sku;
          }
        })),
      })));
      const now = new Date();
      await db.update(supplierAccount).set({ healthStatus: "healthy", consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, lastSelectedAt: now, updatedAt: now }).where(eq(supplierAccount.id, account.id));
      const keyword = search.trim().toLocaleLowerCase();
      const filtered = keyword ? products.filter((product) => product.name.toLocaleLowerCase().includes(keyword) || product.skus.some((sku) => sku.name.toLocaleLowerCase().includes(keyword))) : products;
      const bindings = await db.select({ upstreamProductId: supplierBinding.upstreamProductId, upstreamSkuId: supplierBinding.upstreamSkuId, localProductName: productV2.name }).from(supplierBinding).innerJoin(productSku, eq(productSku.id, supplierBinding.productSkuId)).innerJoin(productV2, eq(productV2.id, productSku.productId)).where(and(eq(supplierBinding.provider, account.provider), eq(supplierBinding.normalizedApiOrigin, account.normalizedApiOrigin), eq(supplierBinding.protocolVersion, normalizeLegacyProtocolVersion(account.provider, account.protocolVersion)), eq(supplierBinding.enabled, true)));
      const bindingNames = new Map(bindings.map((binding) => [`${binding.upstreamProductId}:${binding.upstreamSkuId}`, binding.localProductName]));
      const productsWithLocal = filtered.map((product) => ({ ...product, skus: product.skus.map((sku) => ({ ...sku, localProductName: bindingNames.get(`${product.id}:${sku.id}`) ?? null })) }));
      return { products: productsWithLocal, total: result.total, page, pageSize: result.products.length ? pageSize : 0 };
    } catch (error) {
      lastError = error;
      await db.update(supplierAccount).set({ healthStatus: "degraded", consecutiveFailures: account.consecutiveFailures + 1, lastErrorCode: "supplier_catalog_failed", lastErrorAt: new Date(), updatedAt: new Date() }).where(eq(supplierAccount.id, account.id));
    }
  }
  throw lastError ?? new Error("supplier catalog unavailable");
}

export async function getSupplierSourceBindingCount(source: { provider: SupplierProvider; normalizedApiOrigin: string; protocolVersion?: string }) {
  const { db } = requireAdmin();
  const protocolVersion = source.protocolVersion ? normalizeLegacyProtocolVersion(source.provider, source.protocolVersion) : undefined;
  const bindings = await db.select({ id: supplierBinding.id }).from(supplierBinding).where(and(
    eq(supplierBinding.provider, source.provider),
    eq(supplierBinding.normalizedApiOrigin, source.normalizedApiOrigin),
    ...(protocolVersion ? [eq(supplierBinding.protocolVersion, protocolVersion)] : []),
    eq(supplierBinding.enabled, true),
  ));
  return { bindingCount: bindings.length };
}

export async function syncSupplierSource(source: { provider: SupplierProvider; normalizedApiOrigin: string; protocolVersion?: string }) {
  const { db } = requireAdmin();
  const accounts = await availableAccounts(db, source);
  if (!accounts.length) appError("SUPPLIER_SOURCE_NO_ACCOUNT");
  const now = new Date();
  await ensureSyncSettings(db, { lastStartedAt: now, lastStatus: "running", lastError: null });
  const protocolVersion = source.protocolVersion ? normalizeLegacyProtocolVersion(source.provider, source.protocolVersion) : undefined;
  const bindings = await db.select().from(supplierBinding).where(and(eq(supplierBinding.provider, source.provider), eq(supplierBinding.normalizedApiOrigin, source.normalizedApiOrigin), ...(protocolVersion ? [eq(supplierBinding.protocolVersion, protocolVersion)] : []), eq(supplierBinding.enabled, true)));
  let updated = 0;
  let failed = 0;
  try {
    const account = accounts[0]!;
    const adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: normalizeLegacyProtocolVersion(account.provider, account.protocolVersion), baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
    for (const binding of bindings) {
      try {
        const sku = await adapter.getSku(binding.upstreamProductId, binding.upstreamSkuId);
        const purchaseContext = sku.purchaseContext ? supplierPurchaseContextSchema.parse(sku.purchaseContext) : null;
        await db.update(supplierBinding).set({ upstreamSkuName: sku.name, purchaseContextJson: purchaseContext ? JSON.stringify(purchaseContext) : null, referenceCostMinor: sku.costMinor, stockQuantity: sku.stockQuantity, remoteStatus: sku.active ? "active" : "inactive", lastSyncedAt: now, lastErrorCode: null, updatedAt: now }).where(eq(supplierBinding.id, binding.id));
      } catch {
        failed += 1;
        const confirmedMissing = binding.lastErrorCode === "supplier_sku_missing_once";
        await db.update(supplierBinding).set({ remoteStatus: confirmedMissing ? "deleted" : "unknown", lastErrorCode: confirmedMissing ? "supplier_sku_deleted" : "supplier_sku_missing_once", lastSyncedAt: now, updatedAt: now }).where(eq(supplierBinding.id, binding.id));
      }
      updated += 1;
    }
  } catch (error) {
    await ensureSyncSettings(db, { lastStartedAt: now, lastCompletedAt: new Date(), lastStatus: "failed", lastError: error instanceof Error ? error.message : "supplier_catalog_failed" });
    throw error;
  }
  await ensureSyncSettings(db, { lastStartedAt: now, lastCompletedAt: now, lastStatus: failed ? "failed" : "success", lastError: failed ? "SUPPLIER_SOURCE_REFRESH_FAILED" : null });
  return { productCount: bindings.length, bindingCount: bindings.length, updated, failed };
}

export async function loadSupplierBindings(input: { provider?: SupplierProvider; normalizedApiOrigin?: string; search?: string }) {
  const { db } = requireAdmin();
  const conditions = [input.provider ? eq(supplierBinding.provider, input.provider) : undefined, input.normalizedApiOrigin ? eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin) : undefined, input.search ? or(like(supplierBinding.upstreamProductName, `%${input.search}%`), like(supplierBinding.upstreamSkuName, `%${input.search}%`)) : undefined].filter(Boolean) as Array<ReturnType<typeof eq>>;
  return db.select({ id: supplierBinding.id, productSkuId: supplierBinding.productSkuId, provider: supplierBinding.provider, normalizedApiOrigin: supplierBinding.normalizedApiOrigin, protocolVersion: supplierBinding.protocolVersion, upstreamProductId: supplierBinding.upstreamProductId, upstreamSkuId: supplierBinding.upstreamSkuId, upstreamProductName: supplierBinding.upstreamProductName, upstreamSkuName: supplierBinding.upstreamSkuName, referenceCostMinor: supplierBinding.referenceCostMinor, maxCostMinor: supplierBinding.maxCostMinor, stockQuantity: supplierBinding.stockQuantity, remoteStatus: supplierBinding.remoteStatus, lastSyncedAt: supplierBinding.lastSyncedAt, lastErrorCode: supplierBinding.lastErrorCode, enabled: supplierBinding.enabled, productSkuName: productSku.name }).from(supplierBinding).leftJoin(productSku, eq(productSku.id, supplierBinding.productSkuId)).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(supplierBinding.upstreamProductName), asc(supplierBinding.upstreamSkuName));
}

export async function loadSupplierBindingTargets() {
  const { db } = requireAdmin();
  return db.select({ productSkuId: productSku.id, productSkuName: productSku.name, productName: productV2.name, existingBindingId: supplierBinding.id }).from(productSku).innerJoin(productV2, eq(productV2.id, productSku.productId)).leftJoin(supplierBinding, and(eq(supplierBinding.productSkuId, productSku.id), eq(supplierBinding.enabled, true))).where(and(eq(productSku.fulfillmentSource, "SUPPLIER"), eq(productSku.deliveryType, "SUPPLIER"))).orderBy(asc(productV2.name), asc(productSku.sort), asc(productSku.id));
}
