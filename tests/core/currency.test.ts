// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { currencyHintFor, storefrontCurrencyCode } from "../../lib/currency.ts";

describe("storefront currency hint", () => {
  test("omits the code for simplified Chinese", () => {
    expect(currencyHintFor("zh-CN")).toBeNull();
  });

  test("shows CNY for other locales because orders always settle in CNY", () => {
    expect(currencyHintFor("zh-TW")).toBe(storefrontCurrencyCode);
    expect(currencyHintFor("en-US")).toBe("CNY");
  });
});
