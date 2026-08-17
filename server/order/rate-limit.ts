import { appError } from "@/lib/app-error";

export type OrderRequestAction = "QUERY" | "RESUME" | "RECOVERY";

const WINDOW_MS = 60_000;
const LIMITS = {
  GUEST: { QUERY: 10, RESUME: 3, RECOVERY: 3 },
  ACCOUNT: { QUERY: 60, RESUME: 10, RECOVERY: 3 },
} as const;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function orderRequestLimit(action: OrderRequestAction, authenticated: boolean) {
  return LIMITS[authenticated ? "ACCOUNT" : "GUEST"][action];
}

export function orderRequestIdentity(userId: string | null, clientIp: string | null | undefined) {
  if (userId) return `user:${userId}`;
  const normalizedIp = clientIp?.trim();
  return normalizedIp ? `ip:${normalizedIp}` : "ip:unknown";
}

export async function hashOrderRequestKey(action: OrderRequestAction, identity: string) {
  const payload = new TextEncoder().encode(`order-request:${action}:${identity}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", payload)));
}

export async function enforceOrderRequestRateLimit(
  database: D1Database,
  input: {
    action: OrderRequestAction;
    userId: string | null;
    clientIp?: string | null;
    now?: Date;
  },
) {
  const now = input.now?.getTime() ?? Date.now();
  const expiresAt = now + WINDOW_MS;
  const identity = orderRequestIdentity(input.userId, input.clientIp);
  const keyHash = await hashOrderRequestKey(input.action, identity);
  const limit = orderRequestLimit(input.action, Boolean(input.userId));

  const result = await database.prepare(`
    INSERT INTO orderRequestRateLimit (keyHash, requestCount, expiresAt, createdAt, updatedAt)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(keyHash) DO UPDATE SET
      requestCount = CASE
        WHEN orderRequestRateLimit.expiresAt <= excluded.updatedAt THEN 1
        ELSE orderRequestRateLimit.requestCount + 1
      END,
      expiresAt = CASE
        WHEN orderRequestRateLimit.expiresAt <= excluded.updatedAt THEN excluded.expiresAt
        ELSE orderRequestRateLimit.expiresAt
      END,
      updatedAt = excluded.updatedAt
    RETURNING requestCount
  `).bind(keyHash, expiresAt, now, now).first<{ requestCount: number }>();

  if (!result || result.requestCount > limit) appError(input.action === "RECOVERY" ? "OTP_RATE_LIMITED" : "ORDER_QUERY_RATE_LIMITED");
}
