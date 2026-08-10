import { describe, expect, test } from "bun:test";
import { discountAmountsToCents, discountAmountsToYuan } from "../lib/discount-amounts";

describe("discount amounts", () => {
  test("converts fixed discounts and minimum amounts from yuan to cents", () => {
    expect(discountAmountsToCents("FIXED", "12.30", "100.00")).toEqual({ value: 1230, minAmount: 10000 });
  });

  test("converts stored discount amounts to yuan strings", () => {
    expect(discountAmountsToYuan("FIXED", 1230, 10000)).toEqual({ value: "12.30", minAmount: "100.00" });
  });

  test("keeps percentage discounts as integer percentages", () => {
    expect(discountAmountsToCents("PERCENT", "15", "50.00")).toEqual({ value: 15, minAmount: 5000 });
    expect(discountAmountsToYuan("PERCENT", 15, null)).toEqual({ value: "15", minAmount: null });
  });

  test("rejects invalid yuan values", () => {
    expect(discountAmountsToCents("FIXED", "1.234", "0")).toEqual({ value: null, minAmount: null });
    expect(discountAmountsToCents("FIXED", "1.00", "10.999")).toEqual({ value: 100, minAmount: null });
  });
});
