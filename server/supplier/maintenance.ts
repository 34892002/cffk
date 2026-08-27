import { and, asc, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { supplierAccount, supplierBinding, supplierSyncSettings } from "@/database/drizzle/schema";
import { createSupplierAdapter } from "./providers/factory";
import { normalizeLegacyProtocolVersion } from "./schema";


export async function runSupplierMaintenance(database: D1Database, now = new Date()) {
  const db = createDrizzleDb(database);
  const [settings] = await db.select().from(supplierSyncSettings).where(eq(supplierSyncSettings.id, 1)).limit(1);
  if (settings?.enabled === false) return { skipped: true, reason: "disabled" as const, sources: 0, updated: 0, failed: 0 };
  if (settings?.lastStartedAt && settings.intervalMs > 0 && now.getTime() - settings.lastStartedAt.getTime() < settings.intervalMs) {
    return { skipped: true, reason: "not_due" as const, sources: 0, updated: 0, failed: 0 };
  }

  const [accounts] = await Promise.all([
    db.select().from(supplierAccount).where(eq(supplierAccount.enabled, true)).orderBy(asc(supplierAccount.lastSelectedAt), asc(supplierAccount.id)),
    settings ? Promise.resolve([]) : db.insert(supplierSyncSettings).values({ id: 1, enabled: true, intervalMs: 3_600_000, lastStatus: "running", lastStartedAt: now, createdAt: now, updatedAt: now }),
  ]);
  await db.update(supplierSyncSettings).set({ lastStartedAt: now, lastStatus: "running", lastError: null, updatedAt: now }).where(eq(supplierSyncSettings.id, 1));

  const sources = [...new Map(accounts.map((account) => {
    const protocolVersion = normalizeLegacyProtocolVersion(account.provider, account.protocolVersion);
    return [`${account.provider}:${account.normalizedApiOrigin}:${protocolVersion}`, { provider: account.provider, normalizedApiOrigin: account.normalizedApiOrigin, protocolVersion, account }];
  })).values()];
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const source of sources) {
    try {
      const sourceAccounts = accounts.filter((account) => account.provider === source.provider && account.normalizedApiOrigin === source.normalizedApiOrigin && normalizeLegacyProtocolVersion(account.provider, account.protocolVersion) === source.protocolVersion);
      const account = sourceAccounts[0]!;
      const adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: source.protocolVersion, baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
      const bindings = await db.select().from(supplierBinding).where(and(eq(supplierBinding.provider, source.provider), eq(supplierBinding.normalizedApiOrigin, source.normalizedApiOrigin), eq(supplierBinding.protocolVersion, source.protocolVersion), eq(supplierBinding.enabled, true)));
      for (const binding of bindings) {
        const remote = await adapter.getSku(binding.upstreamProductId, binding.upstreamSkuId);
        await db.update(supplierBinding).set({ upstreamSkuName: remote.name, purchaseContextJson: remote.purchaseContext ? JSON.stringify(remote.purchaseContext) : null, referenceCostMinor: remote.costMinor, stockQuantity: remote.stockQuantity, remoteStatus: remote.active ? "active" : "inactive", lastSyncedAt: now, lastErrorCode: null, updatedAt: now }).where(eq(supplierBinding.id, binding.id));
        updated += 1;
      }
      await db.update(supplierAccount).set({ healthStatus: "healthy", consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, lastSelectedAt: now, updatedAt: now }).where(eq(supplierAccount.id, account.id));
    } catch (cause) {
      failed += 1;
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`${source.provider}:${source.normalizedApiOrigin}:${message}`);
      await db.update(supplierAccount).set({ healthStatus: "degraded", lastErrorCode: "supplier_sync_failed", lastErrorAt: now, consecutiveFailures: source.account.consecutiveFailures + 1, updatedAt: now }).where(eq(supplierAccount.id, source.account.id));
    }
  }
  await db.update(supplierSyncSettings).set({ lastCompletedAt: now, lastStatus: failed ? "failed" : "success", lastError: errors.length ? errors.join("\n").slice(0, 1000) : null, updatedAt: now }).where(eq(supplierSyncSettings.id, 1));
  return { skipped: false, reason: null, sources: sources.length, updated, failed };
}
