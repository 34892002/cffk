import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, test } from "bun:test";
import { AppError } from "../../lib/app-error";
import { maskDiscountError, validateDiscountForItem } from "../../server/discount/service";
import { enforceOrderRequestRateLimit, orderRequestLimit } from "../../server/order/rate-limit";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

function errorCode(operation: () => unknown) {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : String(cause);
  }
}

async function asyncErrorCode(operation: () => Promise<unknown>) {
  try {
    await operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : String(cause);
  }
}

const item = { productId: 1, price: 1000, minBuy: 1, maxBuy: 1 };

describe("public discount error masking", () => {
  test("collapses every coupon failure into one public code", () => {
    for (const code of [
      "DISCOUNT_CODE_NOT_FOUND",
      "DISCOUNT_CODE_DISABLED",
      "DISCOUNT_CODE_EXPIRED",
      "DISCOUNT_CODE_EXHAUSTED",
      "DISCOUNT_CODE_MIN_AMOUNT",
      "DISCOUNT_CODE_PRODUCT_NOT_ALLOWED",
    ]) {
      assert.equal(errorCode(() => maskDiscountError(new AppError(code))), "DISCOUNT_CODE_UNAVAILABLE");
    }
  });

  test("keeps unrelated errors untouched", () => {
    assert.equal(errorCode(() => maskDiscountError(new AppError("PRODUCT_NOT_AVAILABLE"))), "PRODUCT_NOT_AVAILABLE");
    assert.equal(errorCode(() => maskDiscountError(new Error("boom"))), "Error: boom");
  });
});

describe("discount code format guard", () => {
  test("rejects malformed codes before querying the database", async () => {
    const database = {
      select() {
        throw new Error("database should not be queried");
      },
    } as unknown as Parameters<typeof validateDiscountForItem>[0];

    for (const code of ["", " A ", "AB CD", "DISCOUNT.CODE", "优惠券", "A".repeat(65)]) {
      assert.equal(await asyncErrorCode(() => validateDiscountForItem(database, item, 1, code)), "DISCOUNT_CODE_NOT_FOUND", code);
    }
    assert.equal(await asyncErrorCode(() => validateDiscountForItem(database, item, 1, 42 as unknown as string)), "DISCOUNT_CODE_NOT_FOUND");
  });
});

describe("discount preview rate limiting", () => {
  test("uses separate guest and account limits", () => {
    assert.equal(orderRequestLimit("PREVIEW_DISCOUNT", false), 20);
    assert.equal(orderRequestLimit("PREVIEW_DISCOUNT", true), 60);
  });

  test("rejects bursts above the guest limit", async () => {
    const context = createTestDatabase();
    const input = { action: "PREVIEW_DISCOUNT" as const, userId: null, clientIp: "203.0.113.9" };
    const now = new Date("2026-11-26T00:00:00.000Z");
    try {
      for (let count = 0; count < 20; count += 1) {
        await enforceOrderRequestRateLimit(context.database, { ...input, now });
      }
      assert.equal(await asyncErrorCode(() => enforceOrderRequestRateLimit(context.database, { ...input, now })), "ORDER_QUERY_RATE_LIMITED");
    } finally {
      context.close();
    }
  });
});