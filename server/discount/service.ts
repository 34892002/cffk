import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { appError } from "@/lib/app-error";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { discountCode, productSku, productV2 } from "@/database/drizzle/schema";

type DiscountCandidate = {
  id: number;
  code: string;
  type: "FIXED" | "PERCENT";
  value: number;
  minAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  reservedCount: number;
  productIds: string | null;
  expiresAt: Date | null;
  isActive: boolean;
};

type PurchasableProduct = {
  id: number;
  price: number;
  minBuy: number;
  maxBuy: number;
};

export type ValidatedDiscount = {
  id: number;
  code: string;
  discountAmount: number;
  finalAmount: number;
};

export function positiveInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value < 1) appError(`${field}_INVALID`);
  return Math.floor(value);
}

export function calculateDiscount(type: "FIXED" | "PERCENT", value: number, amount: number) {
  return type === "FIXED" ? Math.min(value, amount) : Math.floor(amount * value / 100);
}

export function discountAllowsProduct(productIds: string | null, productId: number) {
  if (!productIds?.trim()) return true;
  const allowed = productIds.split(",").map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isInteger);
  return allowed.length === 0 || allowed.includes(productId);
}

export function validateDiscountCandidate(candidate: DiscountCandidate, productId: number, amount: number, now = Date.now()): ValidatedDiscount {
  if (!candidate.isActive) appError("DISCOUNT_CODE_DISABLED");
  if (candidate.expiresAt && candidate.expiresAt.getTime() <= now) appError("DISCOUNT_CODE_EXPIRED");
  if (candidate.maxUses !== null && candidate.usedCount + candidate.reservedCount >= candidate.maxUses) appError("DISCOUNT_CODE_EXHAUSTED");
  if (candidate.minAmount !== null && amount < candidate.minAmount) appError("DISCOUNT_CODE_MIN_AMOUNT");
  if (!discountAllowsProduct(candidate.productIds, productId)) appError("DISCOUNT_CODE_PRODUCT_NOT_ALLOWED");

  const discountAmount = calculateDiscount(candidate.type, candidate.value, amount);
  return { id: candidate.id, code: candidate.code, discountAmount, finalAmount: Math.max(0, amount - discountAmount) };
}


export async function validateDiscountForItem(database: ReturnType<typeof createDrizzleDb>, item: PurchasableProduct, quantity: number, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code) appError("DISCOUNT_CODE_NOT_FOUND");
  const originalAmount = item.price * quantity;
  const [candidate] = await database.select().from(discountCode).where(eq(discountCode.code, code)).limit(1);
  if (!candidate) appError("DISCOUNT_CODE_NOT_FOUND");
  return { originalAmount, ...validateDiscountCandidate(candidate, item.id, originalAmount) };
}

export async function previewDiscount(database: D1Database, input: { productId: number; productSkuId: number; quantity: number; discountCode: string }) {
  const productId = positiveInteger(input.productId, "PRODUCT_ID");
  const productSkuId = positiveInteger(input.productSkuId, "PRODUCT_SKU_ID");
  const requestedQuantity = positiveInteger(input.quantity, "QUANTITY");
  const db = createDrizzleDb(database);
  const [item] = await db.select({ id: productSku.productId, price: productSku.price, minBuy: productSku.minBuy, maxBuy: productSku.maxBuy }).from(productSku).innerJoin(productV2, eq(productSku.productId, productV2.id)).where(and(eq(productSku.id, productSkuId), eq(productSku.productId, productId), eq(productSku.status, "ACTIVE"), eq(productV2.status, "ACTIVE"))).limit(1);
  if (!item) appError("PRODUCT_NOT_AVAILABLE");

  const quantity = Math.max(item.minBuy, Math.min(item.maxBuy, requestedQuantity));
  const result = await validateDiscountForItem(db, item, quantity, input.discountCode);
  return {
    code: result.code,
    originalAmount: formatCentsAsYuan(result.originalAmount),
    discountAmount: formatCentsAsYuan(result.discountAmount),
    finalAmount: formatCentsAsYuan(result.finalAmount),
  };
}
