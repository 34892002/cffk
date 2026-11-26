import { and, eq, isNull } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { order } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import type { StorefrontLocale } from "@/lib/i18n/locale";
import { enforceOrderRequestRateLimit } from "@/server/order/rate-limit";
import { dispatchPush } from "@/server/push/service";
import type { PushDispatchInput } from "@/server/push/types";
import { verifyTurnstileToken } from "@/server/security/turnstile";
import { getSiteSettings } from "@/server/site/public-settings";
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryEmail } from "./recovery-code";

const PURPOSE = "GUEST_ORDER_RECOVERY";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const HOURLY_SEND_LIMIT = 5;
const CHALLENGE_RETENTION_MS = 60 * 60 * 1000;

/**
 * Best-effort padding for emails without guest orders. Real sends are awaited
 * synchronously, so this only narrows the timing gap when the provider answers
 * inside the window; it is mitigation, not a guarantee.
 */
const MISSING_ORDER_DELAY_MS = 2_000;

export type RecoveryRuntime = Record<string, unknown> & {
  DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
};

export type RecoverySendContext = {
  database: D1Database;
  runtime: RecoveryRuntime;
  secret: string;
  clientIp?: string | null;
  locale?: StorefrontLocale;
};

export type RecoveryChallenge = {
  challengeId: string;
  expiresAt: Date;
};

async function insertRateLimitedChallenge(database: D1Database, values: {
  id: string;
  emailNormalized: string;
  codeHash: string;
  expiresAt: number;
  createdAt: number;
}) {
  const result = await database.prepare(`INSERT INTO guestOrderRecoveryChallenge
    (id, emailNormalized, codeHash, expiresAt, attemptCount, consumedAt, createdAt)
    SELECT ?, ?, ?, ?, 0, NULL, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM guestOrderRecoveryChallenge
      WHERE emailNormalized = ? AND createdAt > ?
    ) AND (
      SELECT COUNT(*) FROM guestOrderRecoveryChallenge
      WHERE emailNormalized = ? AND createdAt > ?
    ) < ?`).bind(
    values.id,
    values.emailNormalized,
    values.codeHash,
    values.expiresAt,
    values.createdAt,
    values.emailNormalized,
    values.createdAt - RESEND_INTERVAL_MS,
    values.emailNormalized,
    values.createdAt - 60 * 60 * 1000,
    HOURLY_SEND_LIMIT,
  ).run();
  return result.meta.changes === 1;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function sendGuestOrderRecoveryCode(
  input: { email: string; turnstileToken?: string },
  context: RecoverySendContext,
): Promise<RecoveryChallenge> {
  const emailNormalized = normalizeRecoveryEmail(input?.email);
  const { database, runtime, secret, clientIp, locale } = context;
  await verifyTurnstileToken(runtime, input?.turnstileToken, clientIp);
  await enforceOrderRequestRateLimit(database, { action: "RECOVERY", userId: null, clientIp });

  const [matchingOrder] = await createDrizzleDb(database).select({ id: order.id }).from(order).where(and(
    isNull(order.ownerUserId),
    eq(order.contactType, "EMAIL"),
    eq(order.contactEmailNormalized, emailNormalized),
  )).limit(1);

  // The challenge is created whether or not the email owns orders, so both
  // paths share the same resend/hourly limits and response shape.
  const challengeId = crypto.randomUUID();
  const code = generateRecoveryCode();
  const createdAt = Date.now();
  const expiresAt = createdAt + CODE_TTL_MS;
  const inserted = await insertRateLimitedChallenge(database, {
    id: challengeId,
    emailNormalized,
    codeHash: await hashRecoveryCode(secret, challengeId, code),
    expiresAt,
    createdAt,
  });
  if (!inserted) appError("OTP_RATE_LIMITED");

  if (!matchingOrder) {
    await wait(MISSING_ORDER_DELAY_MS);
    return { challengeId, expiresAt: new Date(expiresAt) };
  }

  const settings = await getSiteSettings(database);
  const pushInput = {
    scene: PURPOSE,
    messageType: "NORMAL",
    recipient: { type: "CUSTOMER", address: emailNormalized },
    variables: { siteName: settings.siteName, code, expiresMinutes: CODE_TTL_MS / 60_000 },
    source: `guest-order-recovery:${challengeId}`,
    ...(locale ? { locale } : {}),
  } as PushDispatchInput;

  try {
    const results = await dispatchPush(database, runtime, pushInput);
    if (!results.length || results.some(result => result.status !== "SUCCESS")) appError("EMAIL_SEND_FAILED");
  } catch {
    await database.prepare("UPDATE guestOrderRecoveryChallenge SET consumedAt = ? WHERE id = ? AND consumedAt IS NULL").bind(Date.now(), challengeId).run();
    appError("EMAIL_SEND_FAILED");
  }

  return { challengeId, expiresAt: new Date(expiresAt) };
}

export async function pruneGuestOrderRecoveryChallenges(database: D1Database, now = new Date()) {
  const cutoff = now.getTime() - CHALLENGE_RETENTION_MS;
  const result = await database.prepare("DELETE FROM guestOrderRecoveryChallenge WHERE expiresAt < ?").bind(cutoff).run();
  return result.meta.changes ?? 0;
}
