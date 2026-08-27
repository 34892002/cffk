import { telefuncAction } from "@/server/telefunc-action";
import { appError } from "@/lib/app-error";
import { eq } from "drizzle-orm";
import { supplierProviderSchema, supplierProtocolVersionSchema, supplierSyncSettingsSchema } from "./schema";
import { fetchSupplierCatalog, getSupplierSourceBindingCount, listSupplierSources, loadSupplierBindingTargets, loadSupplierBindings, syncSupplierSource } from "./catalog";
import { switchSupplierBinding } from "./import";
import { requireAdmin } from "@/server/telefunc-context";
import { supplierSyncSettings } from "@/database/drizzle/schema";

export const onListSupplierSources = telefuncAction(async () => listSupplierSources());


function parseSupplierSourceInput(input: unknown, withSearch = false) {
  if (!input || typeof input !== "object") appError("SUPPLIER_SOURCE_INPUT_INVALID");
  const value = input as Record<string, unknown>;
  const provider = supplierProviderSchema.safeParse(value.provider);
  const normalizedApiOrigin = typeof value.normalizedApiOrigin === "string" ? value.normalizedApiOrigin.trim() : "";
  const search = typeof value.search === "string" ? value.search : "";
  const page = typeof value.page === "number" && Number.isInteger(value.page) && value.page > 0 ? value.page : 1;
  const forceRefresh = value.forceRefresh === true;
  const protocolVersion = supplierProtocolVersionSchema.safeParse(value.protocolVersion);
  if (!provider.success || !protocolVersion.success || !normalizedApiOrigin || (withSearch && typeof value.search !== "undefined" && typeof value.search !== "string")) {
    appError("SUPPLIER_SOURCE_INPUT_INVALID");
  }
  return { provider: provider.data, normalizedApiOrigin, protocolVersion: protocolVersion.data, search, page, forceRefresh };
}

export const onListSupplierProducts = telefuncAction(async (input: unknown) => {
  const source = parseSupplierSourceInput(input, true);
  return fetchSupplierCatalog(source, source.search, source.page, 50, source.forceRefresh);
});

export const onGetSupplierSourceBindingCount = telefuncAction(async (input: unknown) => {
  const source = parseSupplierSourceInput(input);
  return getSupplierSourceBindingCount(source);
});

export const onSyncSupplierSource = telefuncAction(async (input: unknown) => {
  const source = parseSupplierSourceInput(input);
  return syncSupplierSource(source);
});

export const onListSupplierBindingTargets = telefuncAction(async () => loadSupplierBindingTargets());

export const onListSupplierBindings = telefuncAction(async (input: { provider?: string; normalizedApiOrigin?: string; search?: string } = {}) => {
  const provider = input.provider === undefined ? undefined : supplierProviderSchema.safeParse(input.provider);
  if (provider && !provider.success) appError("SUPPLIER_SOURCE_INPUT_INVALID");
  if (input.normalizedApiOrigin !== undefined && typeof input.normalizedApiOrigin !== "string") appError("SUPPLIER_SOURCE_INPUT_INVALID");
  if (input.search !== undefined && typeof input.search !== "string") appError("SUPPLIER_SOURCE_INPUT_INVALID");
  return loadSupplierBindings({ provider: provider?.success ? provider.data : undefined, normalizedApiOrigin: input.normalizedApiOrigin?.trim(), search: input.search?.trim() });
});

export const onSwitchSupplierBinding = telefuncAction(async (input: unknown) => {
  if (!input || typeof input !== "object") appError("SUPPLIER_SOURCE_INPUT_INVALID");
  const value = input as Record<string, unknown>;
  const provider = supplierProviderSchema.safeParse(value.provider);
  const normalizedApiOrigin = typeof value.normalizedApiOrigin === "string" ? value.normalizedApiOrigin.trim() : "";
  const protocolVersion = supplierProtocolVersionSchema.safeParse(value.protocolVersion);
  const productSkuId = typeof value.productSkuId === "number" ? value.productSkuId : 0;
  const productId = typeof value.productId === "string" ? value.productId : "";
  const skuId = typeof value.skuId === "string" ? value.skuId : "";
  if (!provider.success || !protocolVersion.success || !normalizedApiOrigin || !Number.isInteger(productSkuId) || productSkuId < 1 || !productId || !skuId) appError("SUPPLIER_SOURCE_INPUT_INVALID");
  const result = await fetchSupplierCatalog({ provider: provider.data, normalizedApiOrigin, protocolVersion: protocolVersion.data }, "", 1);
  const product = result.products.find((item) => item.id === productId);
  if (!product) appError("SUPPLIER_PRODUCT_NOT_FOUND");
  const { db } = requireAdmin();
  return switchSupplierBinding(db, { productSkuId, provider: provider.data, normalizedApiOrigin, protocolVersion: protocolVersion.data, productId, skuId }, product);
});

export const onGetSupplierSyncSettings = telefuncAction(async () => {
  const { db } = requireAdmin();
  const [row] = await db.select().from(supplierSyncSettings).where(eq(supplierSyncSettings.id, 1)).limit(1);
  return row ?? { id: 1, enabled: true, intervalMs: 3_600_000, lastStartedAt: null, lastCompletedAt: null, lastStatus: "idle" as const, lastError: null, createdAt: null, updatedAt: null };
});

export const onSaveSupplierSyncSettings = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  const parsed = supplierSyncSettingsSchema.safeParse(input);
  if (!parsed.success) appError("SUPPLIER_SYNC_SETTINGS_INVALID");
  const now = new Date();
  const [existing] = await db.select({ id: supplierSyncSettings.id }).from(supplierSyncSettings).where(eq(supplierSyncSettings.id, 1)).limit(1);
  if (existing) await db.update(supplierSyncSettings).set({ enabled: parsed.data.enabled, intervalMs: parsed.data.intervalMs, updatedAt: now }).where(eq(supplierSyncSettings.id, 1));
  else await db.insert(supplierSyncSettings).values({ id: 1, enabled: parsed.data.enabled, intervalMs: parsed.data.intervalMs, createdAt: now, updatedAt: now });
  return parsed.data;
});
