// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, expect, test } from "bun:test";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { eq } from "drizzle-orm";
import { resolveAuthOrigin } from "../../server/auth-origin.ts";
import { invalidateSiteSettings } from "../../server/site/public-settings";
import { createDrizzleDb } from "../../database/drizzle";
import { siteSetting } from "../../database/drizzle/schema";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  for (const { close } of databases.splice(0)) close();
  invalidateSiteSettings();
});

function runtimeWith(database: D1Database, runtime = "workerd") {
  return { runtime, env: { DB: database } } as unknown as RuntimeAdapter;
}

async function storeSiteUrl(database: D1Database, siteUrl: string | null) {
  const now = new Date();
  await createDrizzleDb(database)
    .insert(siteSetting)
    .values({ id: 1, siteName: "CFFK-Shop", siteUrl, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: siteSetting.id, set: { siteUrl, updatedAt: now } });
  invalidateSiteSettings();
}

async function storedSiteUrl(database: D1Database) {
  const [row] = await createDrizzleDb(database)
    .select({ siteUrl: siteSetting.siteUrl })
    .from(siteSetting)
    .where(eq(siteSetting.id, 1));
  return row?.siteUrl ?? null;
}

describe("resolveAuthOrigin", () => {
  test("returns null instead of the request origin when no site URL is configured", async () => {
    const testDb = createTestDatabase();
    databases.push(testDb);

    expect(await resolveAuthOrigin(runtimeWith(testDb.database))).toBeNull();

    await storeSiteUrl(testDb.database, null);
    expect(await storedSiteUrl(testDb.database)).toBeNull();
    expect(await resolveAuthOrigin(runtimeWith(testDb.database))).toBeNull();
  });

  test("returns only the administrator-configured site origin", async () => {
    const testDb = createTestDatabase();
    databases.push(testDb);

    await storeSiteUrl(testDb.database, "https://shop.example.com/some/path?query=1");
    expect(await resolveAuthOrigin(runtimeWith(testDb.database))).toBe("https://shop.example.com");

    await storeSiteUrl(testDb.database, "not a url");
    expect(await resolveAuthOrigin(runtimeWith(testDb.database))).toBeNull();
  });

  test("returns null outside the Workers runtime", async () => {
    const testDb = createTestDatabase();
    databases.push(testDb);

    await storeSiteUrl(testDb.database, "https://shop.example.com");
    expect(await resolveAuthOrigin(runtimeWith(testDb.database, "node"))).toBeNull();
  });
});