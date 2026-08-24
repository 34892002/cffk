import { telefuncAction } from "@/server/telefunc-action";
import { asc, eq } from "drizzle-orm";
import { discountAmountsToCents, discountAmountsToYuan } from "@/lib/discount-amounts";
import { appError } from "@/lib/app-error";
import { dateTimeInTimezone } from "@/lib/site-timezone";
import { getSiteSettings } from "@/server/site/public-settings";
import { requireAdmin } from "@/server/telefunc-context";
import { discountCode, productV2 } from "@/database/drizzle/schema";


type DiscountType = "FIXED" | "PERCENT";

function getAdminDb() {
  const { db } = requireAdmin();
  return { db };
}
function code(value: string) { const result = value.trim().toUpperCase(); if (!/^[A-Z0-9_-]{2,64}$/.test(result)) appError("DISCOUNT_CODE_INVALID"); return result; }
function integer(value: number, field: string, min = 0) { if (!Number.isInteger(value) || value < min) appError(`${field}_INVALID`); return value; }
function productIds(value?: string) { const ids = (value ?? "").split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0); return ids.length ? [...new Set(ids)].join(",") : null; }


async function internalOnGetDiscountCodes() {
  const { db } = getAdminDb();
  const records = await db.select().from(discountCode).orderBy(asc(discountCode.createdAt), asc(discountCode.id));
  return records.map((record) => ({ ...record, ...discountAmountsToYuan(record.type, record.value, record.minAmount) }));
}

async function internalOnGetDiscountProductOptions() {
  const { db } = getAdminDb();
  return db
    .select({ id: productV2.id, name: productV2.name, slug: productV2.slug, status: productV2.status })
    .from(productV2)
    .orderBy(asc(productV2.sort), asc(productV2.id));
}

async function internalOnSaveDiscountCode(input: { id?: number; code: string; type: DiscountType; value: string; minAmount?: string | null; maxUses?: number | null; productIds?: string; expiresAt?: string | null; isActive: boolean }) {
  const { database, db } = requireAdmin();
  const normalizedCode = code(input.code);
  const type: DiscountType = input.type === "PERCENT" ? "PERCENT" : "FIXED";
  const amounts = discountAmountsToCents(type, input.value, input.minAmount);
  const value = amounts.value;
  if (value === null || value < 1) appError("DISCOUNT_VALUE_INVALID");
  if (type === "PERCENT" && value > 100) appError("DISCOUNT_PERCENT_INVALID");
  const minAmount = amounts.minAmount;
  if (minAmount === null && input.minAmount && input.minAmount !== "0" && input.minAmount !== "0.00") appError("DISCOUNT_MIN_AMOUNT_INVALID");
  const maxUses = input.maxUses === null || input.maxUses === undefined || input.maxUses === 0 ? null : integer(input.maxUses, "DISCOUNT_MAX_USES", 1);
  let expiresAt: Date | null = null;
  if (input.expiresAt?.trim()) {
    try {
      expiresAt = dateTimeInTimezone(input.expiresAt, (await getSiteSettings(database)).timezone);
    } catch {
      appError("DISCOUNT_EXPIRES_AT_INVALID");
    }
  }
  const values = { code: normalizedCode, type, value, minAmount, maxUses, productIds: productIds(input.productIds), expiresAt, isActive: input.isActive, updatedAt: new Date() };
  try {
    if (input.id) {
      const [record] = await db.update(discountCode).set(values).where(eq(discountCode.id, input.id)).returning();
      if (!record) appError("DISCOUNT_NOT_FOUND");
      return record;
    }
    const [record] = await db.insert(discountCode).values({ ...values, createdAt: new Date() }).returning();
    return record;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) appError("DISCOUNT_CODE_CONFLICT");
    throw error;
  }
}

async function internalOnSetDiscountCodeStatus(input: { id: number; isActive: boolean }) {
  const { db } = getAdminDb();
  const [record] = await db.update(discountCode).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(discountCode.id, input.id)).returning();
  if (!record) appError("DISCOUNT_NOT_FOUND");
  return record;
}

export const onGetDiscountCodes = telefuncAction(internalOnGetDiscountCodes);
export const onGetDiscountProductOptions = telefuncAction(internalOnGetDiscountProductOptions);
export const onSaveDiscountCode = telefuncAction(internalOnSaveDiscountCode);
export const onSetDiscountCodeStatus = telefuncAction(internalOnSetDiscountCodeStatus);
