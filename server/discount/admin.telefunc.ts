import { asc, eq } from "drizzle-orm";
import { dateTimeInTimezone } from "@/lib/site-timezone";
import { getSiteSettings } from "@/server/site/public-settings";
import { requireAdmin } from "@/server/telefunc-context";
import { discountCode } from "@/database/drizzle/schema";


type DiscountType = "FIXED" | "PERCENT";

function getAdminDb() {
  const { db } = requireAdmin();
  return { db };
}
function code(value: string) { const result = value.trim().toUpperCase(); if (!/^[A-Z0-9_-]{2,64}$/.test(result)) throw new Error("DISCOUNT_CODE_INVALID"); return result; }
function integer(value: number, field: string, min = 0) { if (!Number.isInteger(value) || value < min) throw new Error(`${field}_INVALID`); return value; }
function productIds(value?: string) { const ids = (value ?? "").split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0); return ids.length ? [...new Set(ids)].join(",") : null; }


export async function onGetDiscountCodes() {
  const { db } = getAdminDb();
  return db.select().from(discountCode).orderBy(asc(discountCode.createdAt), asc(discountCode.id));
}

export async function onSaveDiscountCode(input: { id?: number; code: string; type: DiscountType; value: number; minAmount?: number | null; maxUses?: number | null; productIds?: string; expiresAt?: string | null; isActive: boolean }) {
  const { database, db } = requireAdmin();
  const normalizedCode = code(input.code);
  const type: DiscountType = input.type === "PERCENT" ? "PERCENT" : "FIXED";
  const value = integer(input.value, "DISCOUNT_VALUE", 1);
  if (type === "PERCENT" && value > 100) throw new Error("DISCOUNT_PERCENT_INVALID");
  const minAmount = input.minAmount === null || input.minAmount === undefined || input.minAmount === 0 ? null : integer(input.minAmount, "DISCOUNT_MIN_AMOUNT", 1);
  const maxUses = input.maxUses === null || input.maxUses === undefined || input.maxUses === 0 ? null : integer(input.maxUses, "DISCOUNT_MAX_USES", 1);
  let expiresAt: Date | null = null;
  if (input.expiresAt?.trim()) {
    try {
      expiresAt = dateTimeInTimezone(input.expiresAt, (await getSiteSettings(database)).timezone);
    } catch {
      throw new Error("DISCOUNT_EXPIRES_AT_INVALID");
    }
  }
  const values = { code: normalizedCode, type, value, minAmount, maxUses, productIds: productIds(input.productIds), expiresAt, isActive: input.isActive, updatedAt: new Date() };
  try {
    if (input.id) {
      const [record] = await db.update(discountCode).set(values).where(eq(discountCode.id, input.id)).returning();
      if (!record) throw new Error("DISCOUNT_NOT_FOUND");
      return record;
    }
    const [record] = await db.insert(discountCode).values({ ...values, createdAt: new Date() }).returning();
    return record;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) throw new Error("DISCOUNT_CODE_CONFLICT");
    throw error;
  }
}

export async function onSetDiscountCodeStatus(input: { id: number; isActive: boolean }) {
  const { db } = getAdminDb();
  const [record] = await db.update(discountCode).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(discountCode.id, input.id)).returning();
  if (!record) throw new Error("DISCOUNT_NOT_FOUND");
  return record;
}
