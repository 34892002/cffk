import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { Database } from "bun:sqlite";

type D1Meta = {
  changes: number;
  duration: number;
  last_row_id: number;
  rows_read: number;
  rows_written: number;
};

function meta(result?: { changes?: number; lastInsertRowid?: number | bigint }): D1Meta {
  return {
    changes: result?.changes ?? 0,
    duration: 0,
    last_row_id: Number(result?.lastInsertRowid ?? 0),
    rows_read: 0,
    rows_written: result?.changes ?? 0,
  };
}

class SqliteD1Statement {
  constructor(
    private readonly sqlite: Database,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new SqliteD1Statement(this.sqlite, this.sql, values);
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.sqlite.query(this.sql).get(...this.values) as Record<string, unknown> | null;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async run<T = Record<string, unknown>>() {
    return this.execute<T>();
  }

  async all<T = Record<string, unknown>>() {
    const results = this.sqlite.query(this.sql).all(...this.values) as T[];
    return { success: true, results, meta: meta() };
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    const statement = this.sqlite.query(this.sql);
    const rows = statement.values(...this.values) as T[];
    if (!options?.columnNames) return rows;
    return [statement.columnNames, ...rows] as T[];
  }

  execute<T = Record<string, unknown>>() {
    const result = this.sqlite.query(this.sql).run(...this.values);
    return { success: true, results: [] as T[], meta: meta(result) };
  }
}

export function createTestDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  for (const migrationName of ["0000_initial.sql", "0001_flowery_doomsday.sql"]) {
    const migrationPath = fileURLToPath(new URL(`../../database/migrations/${migrationName}`, import.meta.url));
    const migration = readFileSync(migrationPath, "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      sqlite.run(statement);
    }
  }

  const database = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
    async batch(statements: SqliteD1Statement[]) {
      return sqlite.transaction(() => statements.map((statement) => statement.execute()))();
    },
    async exec(sql: string) {
      sqlite.run(sql);
      return { count: 1, duration: 0 };
    },
    async dump() {
      throw new Error("D1 dump is not implemented by the test adapter");
    },
  } as unknown as D1Database;

  return {
    database,
    sqlite,
    close: () => sqlite.close(),
  };
}
