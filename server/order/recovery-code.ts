import { appError } from "@/lib/app-error";
import { isJsonFormEmail } from "@/lib/json-form-values";

const PURPOSE = "GUEST_ORDER_RECOVERY";

export function normalizeRecoveryEmail(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isJsonFormEmail(normalized)) appError("OTP_EMAIL_INVALID");
  return normalized;
}

export function generateRecoveryCode() {
  const range = 0x1_0000_0000 - (0x1_0000_0000 % 1_000_000);
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= range);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

export async function hashRecoveryCode(secret: string, challengeId: string, code: string) {
  const payload = new TextEncoder().encode(`${secret}\0${challengeId}\0${PURPOSE}\0${code}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
