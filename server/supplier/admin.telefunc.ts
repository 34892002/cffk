import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import { telefuncAction } from "@/server/telefunc-action";
import { requireAdmin } from "@/server/telefunc-context";
import { appError } from "@/lib/app-error";
import { productSku, productV2, supplierAccount, supplierBinding, supplierOrder } from "@/database/drizzle/schema";
import { createSupplierAdapter } from "./providers/factory";
import { normalizeLegacyProtocolVersion, protocolVersionForProvider, supplierAccountInputSchema, supplierAccountEditSchema, supplierAccountIdSchema, supplierAccountEnabledSchema, supplierListQuerySchema } from "./schema";

function normalizedOrigin(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") appError("SUPPLIER_URL_INVALID");
    return url.origin;
  } catch {
    appError("SUPPLIER_URL_INVALID");
  }
}


function publicAccount(record: typeof supplierAccount.$inferSelect) {
  let credentialsConfigured = false;
  try { credentialsConfigured = Object.keys(JSON.parse(record.credentialsJson) as object).length > 0; } catch { /* Legacy malformed credentials are shown as unavailable. */ }
  return { ...record, credentialsJson: undefined, credentialsConfigured };
}

export const onListSupplierAccounts = telefuncAction(async (input: unknown = {}) => {
  const { db } = requireAdmin();
  const parsed = supplierListQuerySchema.safeParse(input);
  if (!parsed.success) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
  const search = parsed.data.search ?? "";
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 20;
  const where = search ? or(like(supplierAccount.name, `%${search}%`), like(supplierAccount.baseUrl, `%${search}%`)) : undefined;
  const [items, totalRows] = await Promise.all([
    db.select().from(supplierAccount).where(where).orderBy(desc(supplierAccount.enabled), asc(supplierAccount.name)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(supplierAccount).where(where),
  ]);
  return { items: items.map(publicAccount), total: totalRows[0]?.value ?? 0, page, pageSize };
});

export const onSaveSupplierAccount = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  if (input && typeof input === "object" && "id" in input) {
    const edit = supplierAccountEditSchema.safeParse(input);
    if (!edit.success) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
    const [existing] = await db.select({ id: supplierAccount.id, credentialsRevision: supplierAccount.credentialsRevision }).from(supplierAccount).where(eq(supplierAccount.id, edit.data.id)).limit(1);
    if (!existing) appError("SUPPLIER_ACCOUNT_NOT_FOUND");
    const origin = normalizedOrigin(edit.data.baseUrl);
    try {
      const credentials = edit.data.credentials;
      const [updated] = await db.update(supplierAccount).set({ name: edit.data.name, baseUrl: edit.data.baseUrl, normalizedApiOrigin: origin, currency: edit.data.currency, currencyDecimals: edit.data.currencyDecimals, ...(credentials ? { credentialsJson: JSON.stringify(credentials), credentialsRevision: existing.credentialsRevision + 1 } : {}), updatedAt: new Date() }).where(eq(supplierAccount.id, edit.data.id)).returning();
      return publicAccount(updated);
    } catch (cause) {
      if (String(cause).includes("UNIQUE constraint failed")) appError("SUPPLIER_ACCOUNT_DUPLICATE");
      throw cause;
    }
  }
  const parsed = supplierAccountInputSchema.safeParse(input);
  if (!parsed.success) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
  const data = parsed.data;
  const protocolVersion = (() => {
    try { return protocolVersionForProvider(data.provider, data.protocolVersion); }
    catch { appError("SUPPLIER_ACCOUNT_INPUT_INVALID"); }
  })();
  const origin = normalizedOrigin(data.baseUrl);
  const now = new Date();
  try {
    if (data.credentials === undefined) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
    const result = await db.insert(supplierAccount).values({ id: crypto.randomUUID(), provider: data.provider, baseUrl: data.baseUrl, normalizedApiOrigin: origin, protocolVersion, name: data.name, currency: data.currency, currencyDecimals: data.currencyDecimals, credentialsJson: JSON.stringify(data.credentials), reserveBalanceMinor: data.reserveBalanceMinor, lowBalanceMinor: data.lowBalanceMinor, maxOrderCostMinor: data.maxOrderCostMinor, enabled: data.enabled, createdAt: now, updatedAt: now }).returning();
    return publicAccount(result[0]);
  } catch (cause) {
    if (String(cause).includes("UNIQUE constraint failed")) appError("SUPPLIER_ACCOUNT_DUPLICATE");
    throw cause;
  }
});

export const onSetSupplierAccountEnabled = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  const parsed = supplierAccountEnabledSchema.safeParse(input);
  if (!parsed.success) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
  const result = await db.update(supplierAccount).set({ enabled: parsed.data.enabled, updatedAt: new Date() }).where(eq(supplierAccount.id, parsed.data.id)).returning();
  if (!result[0]) appError("SUPPLIER_ACCOUNT_NOT_FOUND");
  return publicAccount(result[0]);
});

export const onDeleteSupplierAccount = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  const parsed = supplierAccountIdSchema.safeParse(input);
  if (!parsed.success) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
  const [account] = await db.select().from(supplierAccount).where(eq(supplierAccount.id, parsed.data.id)).limit(1);
  if (!account) appError("SUPPLIER_ACCOUNT_NOT_FOUND");
  const [binding] = await db.select({ id: supplierBinding.id }).from(supplierBinding).innerJoin(productSku, eq(productSku.id, supplierBinding.productSkuId)).innerJoin(productV2, eq(productV2.id, productSku.productId)).where(and(eq(supplierBinding.provider, account.provider), eq(supplierBinding.normalizedApiOrigin, account.normalizedApiOrigin), eq(supplierBinding.protocolVersion, account.protocolVersion))).limit(1);
  const [referencedOrder] = await db.select({ id: supplierOrder.id }).from(supplierOrder).where(eq(supplierOrder.selectedAccountId, account.id)).limit(1);
  if (binding || referencedOrder) {
    const [disabled] = await db.update(supplierAccount).set({ enabled: false, updatedAt: new Date() }).where(eq(supplierAccount.id, account.id)).returning({ id: supplierAccount.id });
    if (!disabled) appError("SUPPLIER_ACCOUNT_NOT_FOUND");
    return { id: disabled.id, disabled: true };
  }
  const [result] = await db.delete(supplierAccount).where(eq(supplierAccount.id, account.id)).returning({ id: supplierAccount.id });
  if (!result) appError("SUPPLIER_ACCOUNT_NOT_FOUND");
  return { id: result.id, disabled: false };
});

export const onTestSupplierAccount = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  const parsed = supplierAccountIdSchema.safeParse(input);
  if (!parsed.success) appError("SUPPLIER_ACCOUNT_INPUT_INVALID");
  const [account] = await db.select().from(supplierAccount).where(eq(supplierAccount.id, parsed.data.id)).limit(1);
  if (!account) appError("SUPPLIER_ACCOUNT_NOT_FOUND");
  const adapter = createSupplierAdapter({ provider: account.provider, protocolVersion: normalizeLegacyProtocolVersion(account.provider, account.protocolVersion), baseUrl: account.baseUrl, credentials: JSON.parse(account.credentialsJson), currency: account.currency, currencyDecimals: account.currencyDecimals });
  const result = await adapter.testConnection();
  await db.update(supplierAccount).set({ balanceMinor: result.balance.amountMinor, balanceSyncedAt: new Date(), healthStatus: "healthy", consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, updatedAt: new Date() }).where(eq(supplierAccount.id, account.id));
  return result;
});
