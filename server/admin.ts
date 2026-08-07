import { and, eq } from "drizzle-orm";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { getDrizzleDb } from "@/database/drizzle";
import { adminBootstrap, adminProfile } from "@/database/drizzle/schema";

export async function isActiveAdmin(runtime: RuntimeAdapter, userId?: string): Promise<boolean> {
  if (!userId) return false;

  const [profile] = await getDrizzleDb(runtime)
    .select({ userId: adminProfile.userId })
    .from(adminProfile)
    .where(and(eq(adminProfile.userId, userId), eq(adminProfile.status, "ACTIVE")))
    .limit(1);

  return Boolean(profile);
}

// The singleton insert is the authority for first-admin assignment. Only its
// winning user receives an administrator profile, even under concurrent sign-up.
export async function bootstrapFirstAdmin(runtime: RuntimeAdapter, userId: string): Promise<boolean> {
  const db = getDrizzleDb(runtime);
  const now = new Date();
  const inserted = await db
    .insert(adminBootstrap)
    .values({ id: 1, userId, createdAt: now })
    .onConflictDoNothing()
    .returning({ userId: adminBootstrap.userId });

  const bootstrapUserId =
    inserted[0]?.userId ??
    (await db
      .select({ userId: adminBootstrap.userId })
      .from(adminBootstrap)
      .where(eq(adminBootstrap.id, 1))
      .limit(1))[0]?.userId;

  if (bootstrapUserId !== userId) return false;

  await db
    .insert(adminProfile)
    .values({ userId, status: "ACTIVE", twoFactorEnabled: false, createdAt: now, updatedAt: now })
    .onConflictDoNothing();

  return true;
}
