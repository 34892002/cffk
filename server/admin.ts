import { eq } from "drizzle-orm";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { getDrizzleDb } from "@/database/drizzle";
import { account, adminBootstrap, session, twoFactor, user } from "@/database/drizzle/schema";

export async function getRootUserId(runtime: RuntimeAdapter): Promise<string | null> {
  const [root] = await getDrizzleDb(runtime)
    .select({ userId: adminBootstrap.userId })
    .from(adminBootstrap)
    .where(eq(adminBootstrap.id, 1))
    .limit(1);

  return root?.userId ?? null;
}

export async function hasRoot(runtime: RuntimeAdapter): Promise<boolean> {
  return (await getRootUserId(runtime)) !== null;
}

export async function isRoot(runtime: RuntimeAdapter, userId?: string): Promise<boolean> {
  if (!userId) return false;
  return (await getRootUserId(runtime)) === userId;
}

export async function bindRoot(runtime: RuntimeAdapter, userId: string): Promise<boolean> {
  const inserted = await getDrizzleDb(runtime)
    .insert(adminBootstrap)
    .values({ id: 1, userId, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ userId: adminBootstrap.userId });

  return inserted[0]?.userId === userId;
}

export async function deleteUnboundSetupUser(runtime: RuntimeAdapter, userId: string): Promise<void> {
  const db = getDrizzleDb(runtime);
  await db.batch([
    db.delete(session).where(eq(session.userId, userId)),
    db.delete(account).where(eq(account.userId, userId)),
    db.delete(twoFactor).where(eq(twoFactor.userId, userId)),
    db.delete(user).where(eq(user.id, userId)),
  ]);
}
