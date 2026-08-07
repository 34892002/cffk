import { drizzle } from "drizzle-orm/d1";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { schema } from "./schema";

export type AppDb = ReturnType<typeof createDrizzleDb>;

const databaseCache = new WeakMap<D1Database, AppDb>();

export function createDrizzleDb(database: D1Database) {
  return drizzle(database, { schema });
}

// Reuse the database wrapper per D1 binding in a Worker isolate.
export function getDrizzleDb(runtime?: RuntimeAdapter): AppDb {
  if (runtime?.runtime !== "workerd" || !runtime.env?.DB) {
    throw new Error("Cloudflare D1 binding (DB) is not available");
  }

  const database = runtime.env.DB as D1Database;
  const cached = databaseCache.get(database);
  if (cached) return cached;

  const db = createDrizzleDb(database);
  databaseCache.set(database, db);
  return db;
}
