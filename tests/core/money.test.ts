// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { convertFromBaseMinor, convertToBaseMinor, formatMinor, formatRate, parseExchangeRate } from "../../lib/money.ts";

describe("currency conversion", () => {
  test("keeps CNY amounts unchanged", () => {
    expect(convertFromBaseMinor(700, "CNY", 1)).toBe(700);
    expect(convertToBaseMinor(700, "CNY", 1)).toBe(700);
  });

  test("converts base minor units with the configured rate", () => {
    expect(convertFromBaseMinor(700, "USD", 0.149)).toBe(104);
    expect(convertToBaseMinor(104, "USD", 0.149)).toBe(698);
  });

  test("respects zero-decimal currencies", () => {
    expect(convertFromBaseMinor(700, "JPY", 20.5)).toBe(144);
    expect(formatMinor(144, "JPY")).not.toContain(".");
  });

  test("rejects non-positive and non-finite rates", () => {
    expect(parseExchangeRate("0.149")).toBe(0.149);
    expect(parseExchangeRate("0")).toBeNull();
    expect(parseExchangeRate("-1")).toBeNull();
    expect(parseExchangeRate("")).toBeNull();
    expect(parseExchangeRate("abc")).toBeNull();
    expect(parseExchangeRate(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("describes the rate in both directions", () => {
    expect(formatRate("USD", 0.149)).toBe("1人民币 = 0.149美元");
    expect(formatRate("CNY", 1)).toBe("1人民币 = 1人民币");
  });
});
