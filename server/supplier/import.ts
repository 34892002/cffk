import { and, eq, inArray } from "drizzle-orm";
import { appError } from "@/lib/app-error";

import { slugify } from "@/lib/slugify";
import { supplierPurchaseContextSchema } from "./schema";
import { category, productSku, productV2, supplierAccount, supplierBinding } from "@/database/drizzle/schema";
import type { requireAdmin } from "@/server/telefunc-context";

export type SupplierDb = ReturnType<typeof requireAdmin>["db"];
import type { SupplierProduct } from "./providers/types";
import type { SupplierProvider } from "./schema";
import { assertSupplierSkuPublishable } from "./eligibility";

export type SupplierImportInput = {
  provider: SupplierProvider;
  normalizedApiOrigin: string;
  protocolVersion: string;
  productId: string;
  skuIds: string[];
  fixedMarkupMinor: string;
  markupBps: number;
  publish: boolean;
};

function markupMinor(costMinor: string, fixedMarkupMinor: string, markupBps: number) {
  const cost = BigInt(costMinor);
  const fixed = BigInt(fixedMarkupMinor);
  return (cost * BigInt(10_000 + markupBps) / 10_000n + fixed).toString();
}

function uniqueSlug(base: string, suffix: string) {
  const value = slugify(base) || "supplier-product";
  return `${value}-${slugify(suffix) || "item"}`.slice(0, 180);
}

export async function importSupplierProduct(db: SupplierDb, input: SupplierImportInput, catalogProduct: SupplierProduct) {
  if (catalogProduct.id !== input.productId) appError("SUPPLIER_PRODUCT_NOT_FOUND");
  const selected = catalogProduct.skus.filter((sku) => input.skuIds.includes(sku.id));
  if (!selected.length) appError("SUPPLIER_SKU_REQUIRED");
  if (!/^(0|[1-9]\d*)$/.test(input.fixedMarkupMinor) || input.markupBps < 0 || input.markupBps > 1_000_000) appError("SUPPLIER_MARKUP_INVALID");
  const [account] = await db.select({ currency: supplierAccount.currency }).from(supplierAccount).where(and(eq(supplierAccount.provider, input.provider), eq(supplierAccount.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierAccount.protocolVersion, input.protocolVersion), eq(supplierAccount.enabled, true))).limit(1);
  if (!account) appError("SUPPLIER_SOURCE_NO_ACCOUNT");
  const now = new Date();
  const [existing] = await db.select({ productId: productV2.id }).from(supplierBinding).innerJoin(productSku, eq(productSku.id, supplierBinding.productSkuId)).innerJoin(productV2, eq(productV2.id, productSku.productId)).where(and(eq(supplierBinding.provider, input.provider), eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierBinding.protocolVersion, input.protocolVersion), eq(supplierBinding.upstreamProductId, input.productId))).limit(1);
  const [defaultCategory] = existing
    ? [undefined]
    : await db.select({ id: category.id }).from(category).where(and(eq(category.slug, "default"), eq(category.status, "ACTIVE"))).limit(1);
  if (!existing && !defaultCategory) appError("PRODUCT_CATEGORY_REQUIRED");
  const localProduct = existing ? (await db.select().from(productV2).where(eq(productV2.id, existing.productId)).limit(1))[0] : (await db.insert(productV2).values({ categoryId: defaultCategory!.id, name: catalogProduct.name, slug: uniqueSlug(catalogProduct.name, `${input.provider}-${input.productId}`), description: catalogProduct.description || catalogProduct.name, status: "DRAFT", createdAt: now, updatedAt: now }).returning())[0];
  if (!localProduct) appError("SUPPLIER_IMPORT_FAILED");
  // A previous import may have created one synthetic SKU using the product
  // code. Once ACG exposes category SKUs, that binding is stale and must not
  // remain active alongside 月费/季费/年费. Keep its local row for order
  // history, but remove it from the selectable supplier catalog.
  const currentBindings = await db.select({ id: supplierBinding.id, upstreamSkuId: supplierBinding.upstreamSkuId, productSkuId: supplierBinding.productSkuId }).from(supplierBinding).where(and(eq(supplierBinding.provider, input.provider), eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierBinding.protocolVersion, input.protocolVersion), eq(supplierBinding.upstreamProductId, input.productId), eq(supplierBinding.enabled, true)));
  const selectedSkuIds = new Set(selected.map((sku) => sku.id));
  const nowForStale = new Date();
  for (const binding of currentBindings) {
    if (selectedSkuIds.has(binding.upstreamSkuId)) continue;
    await db.update(supplierBinding).set({ enabled: false, updatedAt: nowForStale }).where(eq(supplierBinding.id, binding.id));
    await db.update(productSku).set({ status: "INACTIVE", updatedAt: nowForStale }).where(eq(productSku.id, binding.productSkuId));
  }
  const coverImage = catalogProduct.imageUrls[0] ?? null;
  if (!localProduct.coverImage && coverImage) {
    await db.update(productV2).set({ coverImage, updatedAt: now }).where(eq(productV2.id, localProduct.id));
  }
  let imported = 0;
  for (const sku of selected) {
    const priceMinor = BigInt(markupMinor(sku.costMinor, input.fixedMarkupMinor, input.markupBps));
    if (priceMinor < 1n || priceMinor > BigInt(Number.MAX_SAFE_INTEGER)) appError("SUPPLIER_MARKUP_INVALID");
    const price = Number(priceMinor);
    const purchaseContext = sku.purchaseContext ? supplierPurchaseContextSchema.parse(sku.purchaseContext) : undefined;
    const [existingBinding] = await db.select().from(supplierBinding).where(and(eq(supplierBinding.provider, input.provider), eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierBinding.protocolVersion, input.protocolVersion), eq(supplierBinding.upstreamProductId, input.productId), eq(supplierBinding.upstreamSkuId, sku.id), eq(supplierBinding.enabled, true))).limit(1);
    if (existingBinding) {
      // Re-import is the safe replacement for deleting a supplier product that
      // already has orders. Keep local IDs and history, but refresh the
      // presentation and the complete upstream snapshot.
      await db.update(productSku).set({ name: sku.name, price, status: "INACTIVE", updatedAt: now }).where(eq(productSku.id, existingBinding.productSkuId));
      await db.update(supplierBinding).set({ upstreamProductName: catalogProduct.name, upstreamSkuName: sku.name, purchaseContextJson: purchaseContext ? JSON.stringify(purchaseContext) : null, referenceCostMinor: sku.costMinor, maxCostMinor: priceMinor.toString(), stockQuantity: sku.stockQuantity, remoteStatus: catalogProduct.active && sku.active ? "active" : "inactive", lastSyncedAt: now, lastErrorCode: null, updatedAt: now }).where(eq(supplierBinding.id, existingBinding.id));
      imported += 1;
      continue;
    }
    const [localSku] = await db.insert(productSku).values({ productId: localProduct.id, name: sku.name, price, status: "INACTIVE", fulfillmentSource: "SUPPLIER", deliveryType: "SUPPLIER", physicalStock: null, minBuy: 1, maxBuy: 1, sort: imported, createdAt: now, updatedAt: now }).returning();
    if (!localSku) appError("SUPPLIER_IMPORT_FAILED");
    await db.insert(supplierBinding).values({ productSkuId: localSku.id, provider: input.provider, normalizedApiOrigin: input.normalizedApiOrigin, protocolVersion: input.protocolVersion, upstreamProductId: input.productId, upstreamSkuId: sku.id, upstreamProductName: catalogProduct.name, upstreamSkuName: sku.name, purchaseContextJson: purchaseContext ? JSON.stringify(purchaseContext) : null, referenceCostMinor: sku.costMinor, maxCostMinor: priceMinor.toString(), stockQuantity: sku.stockQuantity, remoteStatus: catalogProduct.active && sku.active ? "active" : "inactive", lastSyncedAt: now, enabled: true, createdAt: now, updatedAt: now });
    imported += 1;
  }
  // A re-import is a complete replacement for this upstream product's active
  // SKU set. Do not leave an old synthetic/code SKU or a previously imported
  // category SKU active when it is no longer present in the selected set.
  const refreshedBindings = await db.select({ id: supplierBinding.id, productSkuId: supplierBinding.productSkuId, upstreamSkuId: supplierBinding.upstreamSkuId }).from(supplierBinding).where(and(eq(supplierBinding.provider, input.provider), eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierBinding.protocolVersion, input.protocolVersion), eq(supplierBinding.upstreamProductId, input.productId), eq(supplierBinding.enabled, true)));
  for (const binding of refreshedBindings) {
    if (!selectedSkuIds.has(binding.upstreamSkuId)) {
      await db.update(supplierBinding).set({ enabled: false, updatedAt: now }).where(eq(supplierBinding.id, binding.id));
      await db.update(productSku).set({ status: "INACTIVE", updatedAt: now }).where(eq(productSku.id, binding.productSkuId));
    }
  }
  if (input.publish) {
    if (!catalogProduct.active || selected.some((sku) => !sku.active)) appError("SUPPLIER_SKU_UNAVAILABLE");
    const selectedBindings = await db.select({ productSkuId: supplierBinding.productSkuId }).from(supplierBinding).where(and(
      eq(supplierBinding.provider, input.provider),
      eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin),
      eq(supplierBinding.protocolVersion, input.protocolVersion),
      eq(supplierBinding.upstreamProductId, input.productId),
      inArray(supplierBinding.upstreamSkuId, selected.map((sku) => sku.id)),
      eq(supplierBinding.enabled, true),
    ));
    const selectedLocalSkuIds = selectedBindings.map((binding) => binding.productSkuId);
    if (!selectedLocalSkuIds.length) appError("SUPPLIER_IMPORT_FAILED");
    for (const productSkuId of selectedLocalSkuIds) await assertSupplierSkuPublishable(db, productSkuId);
    await db.update(productSku).set({ status: "ACTIVE", updatedAt: now }).where(and(inArray(productSku.id, selectedLocalSkuIds), eq(productSku.fulfillmentSource, "SUPPLIER")));
    await db.update(productV2).set({ status: "ACTIVE", updatedAt: now }).where(eq(productV2.id, localProduct.id));
  }
  return { productId: localProduct.id, imported, currency: account.currency };
}

export type SupplierBindingSwitchInput = {
  productSkuId: number;
  provider: SupplierProvider;
  normalizedApiOrigin: string;
  protocolVersion: string;
  productId: string;
  skuId: string;
};

export async function switchSupplierBinding(db: SupplierDb, input: SupplierBindingSwitchInput, catalogProduct: SupplierProduct) {
  const sku = catalogProduct.skus.find((item) => item.id === input.skuId);
  if (catalogProduct.id !== input.productId || !sku) appError("SUPPLIER_SKU_NOT_FOUND");
  const [target] = await db.select().from(productSku).where(eq(productSku.id, input.productSkuId)).limit(1);
  if (!target) appError("PRODUCT_SKU_NOT_FOUND");
  if (target.fulfillmentSource !== "SUPPLIER" || target.deliveryType !== "SUPPLIER") appError("SUPPLIER_FULFILLMENT_INVALID");
  const [account] = await db.select({ currency: supplierAccount.currency }).from(supplierAccount).where(and(eq(supplierAccount.provider, input.provider), eq(supplierAccount.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierAccount.protocolVersion, input.protocolVersion), eq(supplierAccount.enabled, true))).limit(1);
  if (!account) appError("SUPPLIER_SOURCE_NO_ACCOUNT");
  const [duplicate] = await db.select({ id: supplierBinding.id }).from(supplierBinding).where(and(eq(supplierBinding.provider, input.provider), eq(supplierBinding.normalizedApiOrigin, input.normalizedApiOrigin), eq(supplierBinding.protocolVersion, input.protocolVersion), eq(supplierBinding.upstreamProductId, input.productId), eq(supplierBinding.upstreamSkuId, input.skuId), eq(supplierBinding.enabled, true))).limit(1);
  if (duplicate) appError("SUPPLIER_BINDING_DUPLICATE");
  const [current] = await db.select({ id: supplierBinding.id }).from(supplierBinding).where(and(eq(supplierBinding.productSkuId, input.productSkuId), eq(supplierBinding.enabled, true))).limit(1);
  const purchaseContext = sku.purchaseContext ? supplierPurchaseContextSchema.parse(sku.purchaseContext) : undefined;
  const now = new Date();
  if (current) await db.update(supplierBinding).set({ enabled: false, updatedAt: now }).where(eq(supplierBinding.id, current.id));
  const [created] = await db.insert(supplierBinding).values({ productSkuId: target.id, provider: input.provider, normalizedApiOrigin: input.normalizedApiOrigin, protocolVersion: input.protocolVersion, upstreamProductId: input.productId, upstreamSkuId: input.skuId, upstreamProductName: catalogProduct.name, upstreamSkuName: sku.name, purchaseContextJson: purchaseContext ? JSON.stringify(purchaseContext) : null, referenceCostMinor: sku.costMinor, maxCostMinor: sku.costMinor, stockQuantity: sku.stockQuantity, remoteStatus: catalogProduct.active && sku.active ? "active" : "inactive", lastSyncedAt: now, enabled: true, createdAt: now, updatedAt: now }).returning({ id: supplierBinding.id });
  if (!created) appError("SUPPLIER_BINDING_SWITCH_FAILED");
  return { id: created.id, productSkuId: target.id, currency: account.currency };
}
