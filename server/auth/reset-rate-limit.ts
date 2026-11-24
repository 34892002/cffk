/**
 * `/request-password-reset` is unauthenticated and Better Auth only limits it
 * per IP, so a distributed caller can keep flooding one mailbox. This adds a
 * per-recipient and a global hourly cap before the reset token is created.
 *
 * It reuses the shared rate-limit counter table with SHA-256 keys, so no email
 * address is ever stored in the counter table.
 */
const WINDOW_MS = 60 * 60 * 1000;
const EMAIL_LIMIT = 6;
const GLOBAL_LIMIT = 60;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function counterKey(scope: string) {
  const payload = new TextEncoder().encode(`password-reset:${scope}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", payload)));
}

async function incrementCounter(database: D1Database, keyHash: string, now: number, expiresAt: number) {
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
  return result?.requestCount ?? 0;
}

export const passwordResetLimits = { windowMs: WINDOW_MS, email: EMAIL_LIMIT, global: GLOBAL_LIMIT } as const;

/**
 * Returns false when the reset email must not be sent. The caller is expected
 * to answer with the same generic success response either way so the endpoint
 * does not leak whether an address is registered or throttled.
 */
export async function allowPasswordResetRequest(database: D1Database, email: string, now = Date.now()) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return true;

  const expiresAt = now + WINDOW_MS;
  const emailCount = await incrementCounter(database, await counterKey(`email:${normalized}`), now, expiresAt);
  if (emailCount > EMAIL_LIMIT) return false;

  const globalCount = await incrementCounter(database, await counterKey("global"), now, expiresAt);
  return globalCount <= GLOBAL_LIMIT;
}
