import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import type { Database } from "bun:sqlite";
import { EMAIL_CHANGE_INTERVAL_MS, EMAIL_CHANGE_RESEND_INTERVAL_MS, requestEmailChange } from "../../server/auth/email-change.ts";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

function createUser(sqlite: Database) {
  const now = Date.now();
  sqlite.query("INSERT INTO user (id, name, email, emailVerified, twoFactorEnabled, createdAt, updatedAt) VALUES ('user-1', 'User', 'user@example.com', 1, 0, ?, ?)").run(now, now);
}

function emailChangeState(sqlite: Database) {
  return sqlite.query("SELECT emailChangePendingEmail AS pending, emailChangeRequestedAt AS requestedAt, emailChangeLastSentAt AS lastSentAt FROM user WHERE id = 'user-1'")
    .get() as { pending: string | null; requestedAt: number | null; lastSentAt: number | null };
}

describe("email change rate limiting", () => {
  test("anchors the 24h window on the first target and lets the same target resend", async () => {
    const context = createTestDatabase();
    databases.push(context);
    createUser(context.sqlite);
    const base = new Date("2026-11-26T00:00:00.000Z");

    assert.equal(await requestEmailChange(context.database, "user-1", "first@example.com", base), true);
    assert.deepEqual(emailChangeState(context.sqlite), { pending: "first@example.com", requestedAt: base.getTime(), lastSentAt: base.getTime() });

    const resendAt = new Date(base.getTime() + EMAIL_CHANGE_RESEND_INTERVAL_MS);
    assert.equal(await requestEmailChange(context.database, "user-1", "first@example.com", resendAt), true);
    assert.deepEqual(emailChangeState(context.sqlite), { pending: "first@example.com", requestedAt: base.getTime(), lastSentAt: resendAt.getTime() });

    const switchAt = new Date(base.getTime() + EMAIL_CHANGE_INTERVAL_MS - 1);
    assert.equal(await requestEmailChange(context.database, "user-1", "second@example.com", switchAt), false);
    assert.equal(emailChangeState(context.sqlite).pending, "first@example.com");

    const nextDay = new Date(base.getTime() + EMAIL_CHANGE_INTERVAL_MS);
    assert.equal(await requestEmailChange(context.database, "user-1", "second@example.com", nextDay), true);
    assert.deepEqual(emailChangeState(context.sqlite), { pending: "second@example.com", requestedAt: nextDay.getTime(), lastSentAt: nextDay.getTime() });
  });

  test("still enforces the 60s cooldown before any resend", async () => {
    const context = createTestDatabase();
    databases.push(context);
    createUser(context.sqlite);
    const base = new Date("2026-11-26T00:00:00.000Z");

    assert.equal(await requestEmailChange(context.database, "user-1", "first@example.com", base), true);
    assert.equal(await requestEmailChange(context.database, "user-1", "first@example.com", new Date(base.getTime() + EMAIL_CHANGE_RESEND_INTERVAL_MS - 1)), false);
  });
});
