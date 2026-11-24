import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, test } from "bun:test";
// @ts-expect-error The test runs with Bun, while this project intentionally omits Bun's global type package.
import { Database } from "bun:sqlite";
import { deleteClosedOrders } from "../../server/order/delete";

function sqliteD1Database() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run(`CREATE TABLE "order" (id INTEGER PRIMARY KEY, status TEXT NOT NULL, paymentStatus TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE orderDelivery (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER NOT NULL REFERENCES "order"(id))`);
  sqlite.run(`CREATE TABLE paymentAttempt (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER NOT NULL REFERENCES "order"(id) ON DELETE CASCADE)`);

  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return { sql, values };
        },
      };
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      sqlite.run("BEGIN");
      try {
        const results = statements.map(({ sql, values }) => {
          const rows = sqlite.query(sql).all(...(values as (string | number)[]));
          return { results: rows, meta: { changes: rows.length } };
        });
        sqlite.run("COMMIT");
        return results;
      } catch (error) {
        sqlite.run("ROLLBACK");
        throw error;
      }
    },
  };

  return { database: database as unknown as D1Database, sqlite, close: () => sqlite.close() };
}

describe("closed order deletion", () => {
  test("deletes only closed, unpaid orders and their delivery records", async () => {
    const { database, sqlite, close } = sqliteD1Database();

    try {
      sqlite.run(`INSERT INTO "order" (id, status, paymentStatus) VALUES
        (1, 'CLOSED', 'UNPAID'),
        (2, 'PAID', 'PAID'),
        (3, 'CLOSED', 'PAID'),
        (4, 'PENDING', 'UNPAID'),
        (5, 'CLOSED', 'FAILED')`);
      sqlite.run(`INSERT INTO orderDelivery (orderId) VALUES (1), (2), (3)`);
      sqlite.run(`INSERT INTO paymentAttempt (orderId) VALUES (1), (2)`);

      assert.equal(await deleteClosedOrders(database, [1, 2, 3, 4, 5]), 2);

      const remainingOrders = sqlite.query(`SELECT id FROM "order" ORDER BY id`).all() as Array<{ id: number }>;
      assert.deepEqual(remainingOrders.map((row) => row.id), [2, 3, 4]);

      // Delivery rows of surviving orders are kept; the deleted order has none.
      const deliveries = sqlite.query("SELECT orderId FROM orderDelivery ORDER BY orderId").all() as Array<{ orderId: number }>;
      assert.deepEqual(deliveries.map((row) => row.orderId), [2, 3]);

      // Cascade still removes attempts for the deleted order.
      const attempts = sqlite.query("SELECT orderId FROM paymentAttempt ORDER BY orderId").all() as Array<{ orderId: number }>;
      assert.deepEqual(attempts.map((row) => row.orderId), [2]);
    } finally {
      close();
    }
  });

  test("returns zero for an empty selection", async () => {
    const { database, close } = sqliteD1Database();

    try {
      assert.equal(await deleteClosedOrders(database, []), 0);
    } finally {
      close();
    }
  });
});
