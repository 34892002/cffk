import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/app-error.ts";
import { assertAdminAccess } from "../server/telefunc-context.ts";

function errorCode(operation: () => unknown) {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : null;
  }
}

test("management access distinguishes guest, user and root", () => {
  assert.equal(errorCode(() => assertAdminAccess(null, false)), "AUTH_REQUIRED");
  assert.equal(errorCode(() => assertAdminAccess({ id: "user-1" }, false)), "ADMIN_ACCESS_REQUIRED");
  assert.deepEqual(assertAdminAccess({ id: "root-1" }, true), { id: "root-1" });
});
