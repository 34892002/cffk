import { describe, expect, test } from "bun:test";
import { Abort } from "telefunc";
import { AppError, errorCode } from "../lib/app-error";
import { userErrorMessage } from "../lib/error-messages";

describe("client error message normalization", () => {
  test("maps stable product errors to user-safe messages", () => {
    expect(userErrorMessage(new AppError("PRODUCT_PRICE_INVALID"))).toBe("商品价格必须为有效金额。");
    expect(userErrorMessage(new AppError("CARD_INVENTORY_SHORTAGE"))).toBe("可用卡密库存不足，请调整数量后重试。");
    expect(userErrorMessage(new Error("PRODUCT_NAME_TOO_LONG"))).toBe("商品名称不能超过 120 个字符。");
  });

  test("maps Telefunc business aborts to user-safe messages", () => {
    const cause = Abort({ code: "EMAIL_PROVIDER_INVALID" });
    expect(errorCode(cause)).toBe("EMAIL_PROVIDER_INVALID");
    expect(userErrorMessage(cause)).toBe("邮件 Provider 配置无效，请检查字段和 Secret 引用。");
  });

  test("does not expose unexpected server exception messages", () => {
    const unexpected = new Error("SQLITE_ERROR: no such table product");
    expect(errorCode(unexpected)).toBe("REQUEST_FAILED");
    expect(userErrorMessage(unexpected)).toBe("操作暂时无法完成，请稍后再试。");
  });

  test("uses action-specific fallback for unexpected failures", () => {
    expect(errorCode(new Error("internal stack detail"))).toBe("REQUEST_FAILED");
    expect(userErrorMessage(new Error("internal stack detail"), "暂时无法验证优惠码，请稍后再试。")).toBe("暂时无法验证优惠码，请稍后再试。");
  });
});
