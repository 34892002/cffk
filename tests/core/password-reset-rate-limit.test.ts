import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, test } from "bun:test";
// @ts-expect-error The test runs with Bun, while this project intentionally omits Bun's global type package.
import { Database } from "bun:sqlite";
import { allowPasswordResetRequest, passwordResetLimits } from "../../server/auth/reset-rate-limit";

function sqliteD1Database() {
  const sqlite = new Database(":memory:");
  sqlite.run(`
    CREATE TABLE orderRequestRateLimit (
      keyHash TEXT PRIMARY KEY NOT NULL,
      requestCount INTEGER DEFAULT 1 NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              return sqlite.query(sql).get(...values) as T | null;
            },
          };
        },
      };
    },
  };
  return { database: database as unknown as D1Database, sqlite, close: () => sqlite.close() };
}

describe("password reset request throttling", () => {
  test("uses six emails per address and sixty globally per hour", () => {
    assert.equal(passwordResetLimits.email, 6);
    assert.equal(passwordResetLimits.global, 60);
    assert.equal(passwordResetLimits.windowMs, 60 * 60 * 1000);
  });

  test("allows only the configured number of emails per address per window and resets afterwards", async () => {
    const { database, close } = sqliteD1Database();
    const base = new Date("2026-11-24T00:00:00.000Z").getTime();

    try {
      for (let count = 0; count < passwordResetLimits.email; count += 1) {
        assert.equal(await allowPasswordResetRequest(database, "Admin@Example.com", base), true);
      }
      assert.equal(await allowPasswordResetRequest(database, "admin@example.com", base), false);
      // Another recipient is unaffected by the exhausted bucket.
      assert.equal(await allowPasswordResetRequest(database, "other@example.com", base), true);
      // The window resets once it has expired.
      assert.equal(await allowPasswordResetRequest(database, "admin@example.com", base + passwordResetLimits.windowMs + 1), true);
    } finally {
      close();
    }
  });

  test("caps the total number of reset emails in a window", async () => {
    const { database, close } = sqliteD1Database();
    const base = 1_800_000_000_000;

    try {
      for (let count = 0; count < passwordResetLimits.global; count += 1) {
        assert.equal(await allowPasswordResetRequest(database, `user${count}@example.com`, base), true);
      }
      assert.equal(await allowPasswordResetRequest(database, "one-more@example.com", base), false);
    } finally {
      close();
    }
  });

  test("never stores raw email addresses in the counter table", async () => {
    const { database, sqlite, close } = sqliteD1Database();

    try {
      await allowPasswordResetRequest(database, "admin@example.com", 1_800_000_000_000);
      const rows = sqlite.query("SELECT keyHash FROM orderRequestRateLimit").all() as Array<{ keyHash: string }>;
      assert.ok(rows.length > 0);
      for (const row of rows) {
        assert.match(row.keyHash, /^[a-f0-9]{64}$/);
        assert.ok(!row.keyHash.includes("admin"));
        assert.ok(!row.keyHash.includes("@"));
      }
    } finally {
      close();
    }
  });
});
