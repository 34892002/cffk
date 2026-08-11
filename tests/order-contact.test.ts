import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/app-error.ts";
import { normalizeOrderContact } from "../server/order/service.ts";

function errorCode(operation: () => unknown) {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : null;
  }
}

test("order email contacts are normalized and validated before storage", () => {
  assert.equal(normalizeOrderContact("EMAIL", " buyer@example.com "), "buyer@example.com");
  assert.equal(errorCode(() => normalizeOrderContact("EMAIL", "Buyer <buyer@example.com>")), "CONTACT_EMAIL_INVALID");
  assert.equal(errorCode(() => normalizeOrderContact("EMAIL", "not-an-email")), "CONTACT_EMAIL_INVALID");
  assert.equal(errorCode(() => normalizeOrderContact("EMAIL", "  ")), "CONTACT_VALUE_REQUIRED");
});

test("non-email contact types retain their own formats", () => {
  assert.equal(normalizeOrderContact("QQ", " 12345678 "), "12345678");
  assert.equal(normalizeOrderContact("TELEGRAM", " @buyer "), "@buyer");
});
