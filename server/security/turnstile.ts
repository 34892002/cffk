import { appError } from "@/lib/app-error";
import { getTurnstileConfig } from "@/lib/turnstile-config";

const SITE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Verifies a Turnstile token for non-Better-Auth entry points (Telefunc).
 * Does nothing when Turnstile is disabled or only partially configured.
 */
export async function verifyTurnstileToken(env: object, token: unknown, remoteIp?: string | null) {
  const config = getTurnstileConfig(env);
  if (!config.enabled) return;

  const captchaResponse = typeof token === "string" ? token.trim() : "";
  if (!captchaResponse) appError("TURNSTILE_REQUIRED");

  const body = new URLSearchParams({ secret: config.secretKey!, response: captchaResponse });
  if (remoteIp) body.set("remoteip", remoteIp);

  let response: Response;
  try {
    response = await fetch(SITE_VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
  } catch {
    appError("TURNSTILE_FAILED");
  }
  if (!response.ok) appError("TURNSTILE_FAILED");

  let result: { success?: unknown };
  try {
    result = await response.json() as { success?: unknown };
  } catch {
    appError("TURNSTILE_FAILED");
  }
  if (result.success !== true) appError("TURNSTILE_FAILED");
}