// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { displayCategoryName } from "../../lib/i18n/category-names.ts";

describe("storefront category names", () => {
  test("localizes the built-in default category", () => {
    expect(displayCategoryName({ slug: "default", name: "默认分类", locale: "en-US" })).toBe("General");
    expect(displayCategoryName({ slug: "default", name: "默认分类", locale: "zh-TW" })).toBe("預設分類");
    expect(displayCategoryName({ slug: "default", name: "默认分类", locale: "zh-CN" })).toBe("默认分类");
  });

  test("keeps ordinary categories and custom names unchanged", () => {
    expect(displayCategoryName({ slug: "cards", name: "卡密分类", locale: "en-US" })).toBe("卡密分类");
    expect(displayCategoryName({ slug: "default", name: "默认分类直连", locale: "en-US" })).toBe("默认分类直连");
  });

  test("prefers an explicit translation", () => {
    expect(displayCategoryName({
      slug: "default",
      name: "默认分类",
      translations: { "en-US": { name: "Store" } },
      locale: "en-US",
    })).toBe("Store");
  });

  test("returns null when the product has no category", () => {
    expect(displayCategoryName({ slug: null, name: null, locale: "en-US" })).toBeNull();
  });
});
