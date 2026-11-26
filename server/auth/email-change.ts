import { sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { user } from "@/database/drizzle/schema";

export const EMAIL_CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_CHANGE_RESEND_INTERVAL_MS = 60 * 1000;

/**
 * Persists a pending email change request.
 *
 * Resending to the same pending target only needs the 60s cooldown, while
 * switching to a different target is limited to once per 24h. Writing
 * `emailChangeRequestedAt` here is what makes the 24h guard effective; the
 * previous hook only read the column, so unverified requests could mail the
 * new address every minute.
 */
export async function requestEmailChange(database: D1Database, userId: string, newEmail: string, now = new Date()) {
  const timestamp = now.getTime();
  const result = await createDrizzleDb(database)
    .update(user)
    .set({
      emailChangePendingEmail: newEmail,
      emailChangeLastSentAt: now,
      emailChangeRequestedAt: sql`CASE WHEN ${user.emailChangePendingEmail} = ${newEmail} THEN ${user.emailChangeRequestedAt} ELSE ${timestamp} END`,
    })
    .where(sql`${user.id} = ${userId}
      AND (${user.emailChangeLastSentAt} IS NULL OR ${user.emailChangeLastSentAt} <= ${timestamp - EMAIL_CHANGE_RESEND_INTERVAL_MS})
      AND (
        ${user.emailChangePendingEmail} = ${newEmail}
        OR ${user.emailChangeRequestedAt} IS NULL
        OR ${user.emailChangeRequestedAt} <= ${timestamp - EMAIL_CHANGE_INTERVAL_MS}
      )`)
    .returning({ id: user.id });
  return result.length > 0;
}
