/**
 * Better Auth responses carry both an HTTP status and a JSON body `code`.
 * Login pages must tell CAPTCHA, origin and rate-limit failures apart from real
 * credential errors; otherwise a misconfigured Turnstile key looks exactly like
 * a wrong password.
 */
export type AuthErrorKind = "captcha" | "rateLimited" | "origin" | "emailNotVerified" | "accountDisabled" | "credentials" | "unknown";

// UNKNOWN_ERROR is what the CAPTCHA plugin returns when it cannot verify a token.
const captchaCodes = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED", "SERVICE_UNAVAILABLE", "MISSING_SECRET_KEY", "UNKNOWN_ERROR"]);
const credentialCodes = new Set(["INVALID_EMAIL_OR_PASSWORD", "INVALID_ADMIN_CREDENTIALS", "INVALID_EMAIL", "EMAIL_PASSWORD_DISABLED"]);
const originCodes = new Set(["INVALID_ORIGIN", "MISSING_OR_NULL_ORIGIN", "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED"]);

export function classifyAuthError(error: unknown): AuthErrorKind {
  const record = typeof error === "object" && error !== null ? (error as { code?: unknown; status?: unknown }) : {};
  const code = typeof record.code === "string" ? record.code.trim().toUpperCase() : "";
  const status = typeof record.status === "number" ? record.status : null;
  if (captchaCodes.has(code)) return "captcha";
  if (code === "TOO_MANY_REQUESTS" || code === "PASSWORD_RESET_RATE_LIMITED" || status === 429) return "rateLimited";
  if (originCodes.has(code)) return "origin";
  if (code === "EMAIL_NOT_VERIFIED") return "emailNotVerified";
  if (code === "ACCOUNT_DISABLED") return "accountDisabled";
  if (credentialCodes.has(code)) return "credentials";
  if (status === 401) return "credentials";
  return "unknown";
}
