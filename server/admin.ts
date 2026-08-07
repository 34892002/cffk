import { eq } from "drizzle-orm";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { getDrizzleDb } from "@/database/drizzle";
import { adminBootstrap } from "@/database/drizzle/schema";

export async function isRoot(runtime: RuntimeAdapter, userId?: string): Promise<boolean> {
  if (!userId) return false;

  const [root] = await getDrizzleDb(runtime)
    .select({ userId: adminBootstrap.userId })
    .from(adminBootstrap)
    .where(eq(adminBootstrap.id, 1))
    .limit(1);

  return root?.userId === userId;
}

// The singleton row elects exactly one first registered user as root.
export async function bootstrapFirstRoot(runtime: RuntimeAdapter, userId: string): Promise<boolean> {
  const inserted = await getDrizzleDb(runtime)
    .insert(adminBootstrap)
    .values({ id: 1, userId, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ userId: adminBootstrap.userId });

  return inserted[0]?.userId === userId;
}
