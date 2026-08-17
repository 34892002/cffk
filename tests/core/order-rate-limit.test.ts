import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, test } from "bun:test";
// @ts-expect-error The test runs with Bun, while this project intentionally omits Bun's global type package.
import { Database } from "bun:sqlite";
import { AppError } from "../../lib/app-error";
import { generateOrderNo } from "../../server/order/order-number";
import {
  enforceOrderRequestRateLimit,
  hashOrderRequestKey,
  orderRequestIdentity,
  orderRequestLimit,
} from "../../server/order/rate-limit";

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
  return { database: database as unknown as D1Database, close: () => sqlite.close() };
}

async function errorCode(operation: () => Promise<unknown>) {
  try {
    await operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : null;
  }
}

describe("public order request rate limiting", () => {
  test("uses separate guest and account limits for query and resume", () => {
    assert.equal(orderRequestLimit("QUERY", false), 10);
    assert.equal(orderRequestLimit("RESUME", false), 3);
    assert.equal(orderRequestLimit("RECOVERY", false), 3);
    assert.equal(orderRequestLimit("QUERY", true), 60);
    assert.equal(orderRequestLimit("RESUME", true), 10);
  });

  test("hashes action and requester identity without storing raw identifiers", async () => {
    const identity = orderRequestIdentity(null, " 203.0.113.7 ");
    const queryHash = await hashOrderRequestKey("QUERY", identity);
    const resumeHash = await hashOrderRequestKey("RESUME", identity);

    assert.equal(identity, "ip:203.0.113.7");
    assert.match(queryHash, /^[a-f0-9]{64}$/);
    assert.notEqual(queryHash, resumeHash);
    assert.ok(!queryHash.includes("203.0.113.7"));
    assert.equal(orderRequestIdentity("user-123", "203.0.113.7"), "user:user-123");
  });

  test("rejects after the guest limit and resets an expired window", async () => {
    const { database, close } = sqliteD1Database();
    const base = new Date("2026-08-13T00:00:00.000Z");
    const input = { action: "RESUME" as const, userId: null, clientIp: "203.0.113.8" };

    try {
      for (let count = 0; count < 3; count += 1) {
        await enforceOrderRequestRateLimit(database, { ...input, now: base });
      }
      assert.equal(
        await errorCode(() => enforceOrderRequestRateLimit(database, { ...input, now: base })),
        "ORDER_QUERY_RATE_LIMITED",
      );

      await enforceOrderRequestRateLimit(database, {
        ...input,
        now: new Date(base.getTime() + 60_000),
      });
    } finally {
      close();
    }
  });

  test("generates opaque order numbers with 128 random bits", () => {
    const values = new Set(Array.from({ length: 100 }, () => generateOrderNo()));
    assert.equal(values.size, 100);
    for (const orderNo of values) assert.match(orderNo, /^ORD[a-f0-9]{32}$/);
  });
});
