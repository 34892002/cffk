import { and, eq, isNull } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { guestOrderRecoveryChallenge, order } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";

import { formatCentsAsYuan } from "@/lib/payment-utils";
import { dispatchPush } from "@/server/push/service";
import type { PushDispatchInput } from "@/server/push/types";
import { getSiteSettings } from "@/server/site/public-settings";
import { enforceOrderRequestRateLimit } from "@/server/order/rate-limit";
import { telefuncAction } from "@/server/telefunc-action";
import { getContext } from "telefunc";
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryEmail } from "./recovery-code";

const PURPOSE = "GUEST_ORDER_RECOVERY";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const HOURLY_SEND_LIMIT = 5;
const MAX_VERIFY_ATTEMPTS = 5;

type RecoveryRuntime = Record<string, unknown> & {
  DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
};

type TelefuncContext = {
  env?: RecoveryRuntime;
  clientIp?: string | null;
};

export type GuestOrderRecoverySummary = {
  orderNo: string;
  productName: string;
  amount: string;
  createdAt: Date;
};

export type GuestOrderRecoveryResult = {
  orders: GuestOrderRecoverySummary[];
  truncated: boolean;
};

function recoveryContext() {
  const runtime = getContext<TelefuncContext>().env;
  if (!runtime?.DB) appError("DATABASE_UNAVAILABLE");
  const secret = runtime.BETTER_AUTH_SECRET?.trim();
  if (!secret) appError("DATABASE_UNAVAILABLE");
  return { database: runtime.DB, runtime, secret, clientIp: getContext<TelefuncContext>().clientIp };
}


function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}


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

async function internalOnSendGuestOrderRecoveryCode(input: { email: string }) {
  const emailNormalized = normalizeRecoveryEmail(input?.email);
  const { database, runtime, secret, clientIp } = recoveryContext();
  await enforceOrderRequestRateLimit(database, { action: "RECOVERY", userId: null, clientIp });
  const [matchingOrder] = await createDrizzleDb(database).select({ id: order.id }).from(order).where(and(
    isNull(order.ownerUserId),
    eq(order.contactType, "EMAIL"),
    eq(order.contactEmailNormalized, emailNormalized),
  )).limit(1);
  if (!matchingOrder) appError("ORDER_NOT_FOUND");
  const challengeId = crypto.randomUUID();
  const code = generateRecoveryCode();
  const createdAt = Date.now();
  const inserted = await insertRateLimitedChallenge(database, {
    id: challengeId,
    emailNormalized,
    codeHash: await hashRecoveryCode(secret, challengeId, code),
    expiresAt: createdAt + CODE_TTL_MS,
    createdAt,
  });
  if (!inserted) appError("OTP_RATE_LIMITED");

  const settings = await getSiteSettings(database);
  const pushInput = {
    scene: PURPOSE,
    messageType: "NORMAL",
    recipient: { type: "CUSTOMER", address: emailNormalized },
    variables: { siteName: settings.siteName, code, expiresMinutes: CODE_TTL_MS / 60_000 },
    source: `guest-order-recovery:${challengeId}`,
  } as PushDispatchInput;

  try {
    const results = await dispatchPush(database, runtime, pushInput);
    if (!results.length || results.some(result => result.status !== "SUCCESS")) appError("EMAIL_SEND_FAILED");
  } catch {
    await database.prepare("UPDATE guestOrderRecoveryChallenge SET consumedAt = ? WHERE id = ? AND consumedAt IS NULL").bind(Date.now(), challengeId).run();
    appError("EMAIL_SEND_FAILED");
  }

  return { challengeId, expiresAt: new Date(createdAt + CODE_TTL_MS) };
}

async function invalidAttempt(database: D1Database, challengeId: string, now: number): Promise<never> {
  await database.prepare(`UPDATE guestOrderRecoveryChallenge
    SET attemptCount = attemptCount + 1
    WHERE id = ? AND consumedAt IS NULL AND expiresAt > ? AND attemptCount < ?`).bind(challengeId, now, MAX_VERIFY_ATTEMPTS).run();
  appError("OTP_INVALID_OR_EXPIRED");
}

async function internalOnVerifyGuestOrderRecoveryCode(input: { challengeId: string; email: string; code: string }): Promise<GuestOrderRecoveryResult> {
  const challengeId = typeof input?.challengeId === "string" ? input.challengeId.trim() : "";
  const emailNormalized = normalizeRecoveryEmail(input?.email);
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  const { database, secret } = recoveryContext();
  const now = Date.now();
  if (!challengeId || !/^\d{6}$/.test(code)) return invalidAttempt(database, challengeId, now);

  const db = createDrizzleDb(database);
  const [challenge] = await db.select({ codeHash: guestOrderRecoveryChallenge.codeHash })
    .from(guestOrderRecoveryChallenge)
    .where(and(
      eq(guestOrderRecoveryChallenge.id, challengeId),
      eq(guestOrderRecoveryChallenge.emailNormalized, emailNormalized),
      isNull(guestOrderRecoveryChallenge.consumedAt),
    ))
    .limit(1);
  const submittedHash = await hashRecoveryCode(secret, challengeId, code);
  if (!challenge || !constantTimeEqual(challenge.codeHash, submittedHash)) {
    return invalidAttempt(database, challengeId, now);
  }

  const [consumeResult, rows] = await database.batch([
    database.prepare(`UPDATE guestOrderRecoveryChallenge SET consumedAt = ?
      WHERE id = ? AND emailNormalized = ? AND codeHash = ?
        AND consumedAt IS NULL AND expiresAt > ? AND attemptCount < ?`).bind(
      now, challengeId, emailNormalized, challenge.codeHash, now, MAX_VERIFY_ATTEMPTS,
    ),
    database.prepare(`SELECT orderNo, productNameSnapshot AS productName, amount, createdAt
      FROM \`order\`
      WHERE ownerUserId IS NULL AND contactType = 'EMAIL' AND contactEmailNormalized = ?
      ORDER BY createdAt DESC LIMIT 51`).bind(emailNormalized),
  ]);
  if (consumeResult.meta.changes !== 1) appError("OTP_INVALID_OR_EXPIRED");

  const records = rows.results as unknown as Array<{ orderNo: string; productName: string; amount: number; createdAt: number }>;
  return {
    orders: records.slice(0, 50).map(record => ({
      orderNo: record.orderNo,
      productName: record.productName,
      amount: formatCentsAsYuan(record.amount),
      createdAt: new Date(record.createdAt),
    })),
    truncated: records.length > 50,
  };
}

export const onSendGuestOrderRecoveryCode = telefuncAction(internalOnSendGuestOrderRecoveryCode);
export const onVerifyGuestOrderRecoveryCode = telefuncAction(internalOnVerifyGuestOrderRecoveryCode);
