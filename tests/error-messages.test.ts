import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/app-error.ts";
import { userErrorMessage } from "../lib/error-messages.ts";

test("userErrorMessage returns only fixed public messages for known codes", () => {
  assert.equal(userErrorMessage(new AppError("AUTH_REQUIRED")), "请先登录后再继续操作。");
  assert.equal(userErrorMessage(new AppError("ADMIN_ACCESS_REQUIRED")), "管理员身份已失效，请重新登录。");
  assert.equal(userErrorMessage(new Error("S3_SECRET_UNAVAILABLE")), "未找到 S3 Worker Secret，请检查 Secret 引用。");
});

test("userErrorMessage never exposes unknown raw error details", () => {
  const rawError = new Error("D1 failed: token=raw-token-value");
  assert.equal(userErrorMessage(rawError), "接口异常，请稍后重试。");
  assert.doesNotMatch(userErrorMessage(rawError), /raw-token-value|D1 failed/);
});
