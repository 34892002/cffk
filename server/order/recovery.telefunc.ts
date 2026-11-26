import { and, eq, isNull } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { guestOrderRecoveryChallenge } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { formatMinor, isCurrencyCode } from "@/lib/money";
import type { StorefrontLocale } from "@/lib/i18n/locale";
import { telefuncAction } from "@/server/telefunc-action";
import { getContext } from "telefunc";
import { hashRecoveryCode, normalizeRecoveryEmail } from "./recovery-code";
import { sendGuestOrderRecoveryCode, type RecoveryRuntime } from "./recovery-service";

const MAX_VERIFY_ATTEMPTS = 5;

type TelefuncContext = {
  env?: RecoveryRuntime;
  clientIp?: string | null;
  locale?: StorefrontLocale;
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
  const context = getContext<TelefuncContext>();
  const runtime = context.env;
  if (!runtime?.DB) appError("DATABASE_UNAVAILABLE");
  const secret = runtime.BETTER_AUTH_SECRET?.trim();
  if (!secret) appError("DATABASE_UNAVAILABLE");
  return { database: runtime.DB, runtime, secret, clientIp: context.clientIp, locale: context.locale };
}


function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}


async function internalOnSendGuestOrderRecoveryCode(input: { email: string; turnstileToken?: string }) {
  const { database, runtime, secret, clientIp, locale } = recoveryContext();
  return sendGuestOrderRecoveryCode(input, { database, runtime, secret, clientIp, locale });
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
    database.prepare(`SELECT orderNo, productNameSnapshot AS productName, amount, currency, createdAt
      FROM \`order\`
      WHERE ownerUserId IS NULL AND contactType = 'EMAIL' AND contactEmailNormalized = ?
      ORDER BY createdAt DESC LIMIT 51`).bind(emailNormalized),
  ]);
  if (consumeResult.meta.changes !== 1) appError("OTP_INVALID_OR_EXPIRED");

  const records = rows.results as unknown as Array<{ orderNo: string; productName: string; amount: number; currency: string; createdAt: number }>;
  return {
    orders: records.slice(0, 50).map(record => ({
      orderNo: record.orderNo,
      productName: record.productName,
      amount: formatMinor(record.amount, isCurrencyCode(record.currency) ? record.currency : "CNY"),
      createdAt: new Date(record.createdAt),
    })),
    truncated: records.length > 50,
  };
}

export const onSendGuestOrderRecoveryCode = telefuncAction(internalOnSendGuestOrderRecoveryCode);
export const onVerifyGuestOrderRecoveryCode = telefuncAction(internalOnVerifyGuestOrderRecoveryCode);
