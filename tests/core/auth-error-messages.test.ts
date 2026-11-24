// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { classifyAuthError } from "../../lib/auth-error-messages";

describe("classifyAuthError", () => {
  test("treats CAPTCHA failures as CAPTCHA, not credentials", () => {
    expect(classifyAuthError({ status: 400, code: "MISSING_RESPONSE" })).toBe("captcha");
    expect(classifyAuthError({ status: 403, code: "VERIFICATION_FAILED" })).toBe("captcha");
    expect(classifyAuthError({ status: 500, code: "UNKNOWN_ERROR" })).toBe("captcha");
  });

  test("recognises rate limiting by code and status", () => {
    expect(classifyAuthError({ status: 429, code: "TOO_MANY_REQUESTS" })).toBe("rateLimited");
    expect(classifyAuthError({ status: 429 })).toBe("rateLimited");
  });

  test("recognises origin and account state failures", () => {
    expect(classifyAuthError({ status: 403, code: "INVALID_ORIGIN" })).toBe("origin");
    expect(classifyAuthError({ status: 403, code: "MISSING_OR_NULL_ORIGIN" })).toBe("origin");
    expect(classifyAuthError({ status: 403, code: "EMAIL_NOT_VERIFIED" })).toBe("emailNotVerified");
    expect(classifyAuthError({ status: 403, code: "ACCOUNT_DISABLED" })).toBe("accountDisabled");
  });

  test("keeps real credential errors mapped to credentials", () => {
    expect(classifyAuthError({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("credentials");
    expect(classifyAuthError({ status: 401, code: "INVALID_ADMIN_CREDENTIALS" })).toBe("credentials");
    expect(classifyAuthError({ status: 401 })).toBe("credentials");
  });

  test("falls back to unknown for missing or unexpected errors", () => {
    expect(classifyAuthError(undefined)).toBe("unknown");
    expect(classifyAuthError(null)).toBe("unknown");
    expect(classifyAuthError(new Error("network"))).toBe("unknown");
    expect(classifyAuthError({ status: 500, code: "SOMETHING_ELSE" })).toBe("unknown");
  });

  test("matches codes case-insensitively", () => {
    expect(classifyAuthError({ status: 403, code: "verification_failed" })).toBe("captcha");
  });
});
