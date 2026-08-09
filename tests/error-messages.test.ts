import { describe, expect, test } from "bun:test";
import { AppError, errorCode } from "../lib/app-error";
import { userErrorMessage } from "../lib/error-messages";

describe("client error message normalization", () => {
  test("maps stable product errors to user-safe messages", () => {
    expect(userErrorMessage(new AppError("PRODUCT_PRICE_INVALID"))).toBe("商品价格必须为有效金额。");
    expect(userErrorMessage(new Error("PRODUCT_NAME_TOO_LONG"))).toBe("商品名称不能超过 120 个字符。");
  });

  test("does not expose unexpected server exception messages", () => {
    const unexpected = new Error("SQLITE_ERROR: no such table product");
    expect(errorCode(unexpected)).toBe("REQUEST_FAILED");
    expect(userErrorMessage(unexpected)).toBe("接口异常，请稍后重试。");
  });

  test("rejects non-code error messages as unknown failures", () => {
    expect(errorCode(new Error("internal stack detail"))).toBe("REQUEST_FAILED");
  });
});
