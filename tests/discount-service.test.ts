import { describe, expect, test } from "bun:test";
import { AppError } from "../lib/app-error";
import { calculateDiscount, validateDiscountCandidate } from "../server/discount/service";

const candidate = {
  id: 1,
  code: "SAVE10",
  type: "FIXED" as const,
  value: 1000,
  minAmount: null,
  maxUses: null,
  usedCount: 0,
  reservedCount: 0,
  productIds: null,
  expiresAt: null,
  isActive: true,
};

function errorCode(operation: () => unknown) {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : null;
  }
}

describe("discount validation", () => {
  test("calculates fixed and percentage reductions in cents", () => {
    expect(calculateDiscount("FIXED", 1000, 500)).toBe(500);
    expect(calculateDiscount("PERCENT", 15, 1999)).toBe(299);
  });

  test("returns the payable amount without reserving a use", () => {
    expect(validateDiscountCandidate(candidate, 7, 2999)).toEqual({ id: 1, code: "SAVE10", discountAmount: 1000, finalAmount: 1999 });
    expect(candidate).toMatchObject({ usedCount: 0, reservedCount: 0 });
  });

  test("rejects exhausted, below-threshold, and product-restricted codes", () => {
    expect(errorCode(() => validateDiscountCandidate({ ...candidate, maxUses: 1, usedCount: 1 }, 7, 2999))).toBe("DISCOUNT_CODE_EXHAUSTED");
    expect(errorCode(() => validateDiscountCandidate({ ...candidate, minAmount: 3000 }, 7, 2999))).toBe("DISCOUNT_CODE_MIN_AMOUNT");
    expect(errorCode(() => validateDiscountCandidate({ ...candidate, productIds: "8,9" }, 7, 2999))).toBe("DISCOUNT_CODE_PRODUCT_NOT_ALLOWED");
  });
});
