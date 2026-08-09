import { describe, expect, test } from "bun:test";
import { AppError } from "../lib/app-error";
import { assertAdminAccess } from "../server/telefunc-context";

function errorCode(run: () => unknown) {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : null;
  }
}

describe("admin Telefunc authorization boundary", () => {
  test("guest requests are rejected before admin access", () => {
    expect(errorCode(() => assertAdminAccess(null, false))).toBe("AUTH_REQUIRED");
  });

  test("authenticated non-admin users are rejected", () => {
    expect(errorCode(() => assertAdminAccess({ id: "user-1" }, false))).toBe("ADMIN_ACCESS_REQUIRED");
  });

  test("root admin access returns the authenticated user", () => {
    const user = { id: "root-1" };
    expect(assertAdminAccess(user, true)).toBe(user);
  });
});
