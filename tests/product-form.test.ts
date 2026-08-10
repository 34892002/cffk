import { describe, expect, test } from "bun:test";
import { defaultProductForm, formToSaveInput, productDetailToForm, productFormSchema, slugifyProductName } from "../pages/@adminPath/catalog/products/product-form";

describe("product form", () => {
  test("has safe defaults and converts yuan to cents", () => {
    const form = defaultProductForm(2);
    expect(form.categoryId).toBe(2);
    expect(formToSaveInput({ ...form, name: "商品", slug: "product", price: "12.30" }).price).toBe(1230);
  });
  test("preserves the selected product status", () => {
    const form = defaultProductForm(2);
    expect(formToSaveInput({ ...form, name: "商品", slug: "product", status: "ACTIVE" }).status).toBe("ACTIVE");
  });
  test("normalizes delivery-specific fields before save", () => {
    const saved = formToSaveInput({ ...defaultProductForm(2), name: "商品", slug: "product", deliveryType: "CARD_AUTO", physicalStock: 5, fixedDeliveryContent: "不应随自动卡密保存" });
    expect(saved.physicalStock).toBeNull();
  });
  test("converts management detail cents and null text fields", () => {
    const form = productDetailToForm({ id: 1, categoryId: 2, name: "商品", slug: "product", subtitle: null, coverImage: null, description: null, fixedDeliveryContent: null, manualDeliveryHint: null, purchaseNote: null, price: 1234, status: "DRAFT", deliveryType: "CARD_AUTO", stockMode: "FINITE", physicalStock: null, minBuy: 1, maxBuy: 3, sort: 0, createdAt: new Date(), updatedAt: new Date() });
    expect(form.price).toBe("12.34");
    expect(form.subtitle).toBe("");
  });
  test("generates stable slugs from Chinese and Latin names", () => {
    expect(slugifyProductName("测试 商品 Pro 2")).toBe("ce-shi-shang-pin-pro-2");
    expect(slugifyProductName("  API---Key  ")).toBe("api-key");
  });
  test("rejects an invalid buy range", () => {
    const result = productFormSchema.safeParse({ ...defaultProductForm(2), name: "商品", slug: "product", minBuy: 3, maxBuy: 2 });
    expect(result.success).toBe(false);
  });
});
