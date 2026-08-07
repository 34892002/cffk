import { and, asc, count, eq, sql } from "drizzle-orm";
import { adminOperationLog, adminProfile, user } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { requireAdmin } from "@/server/telefunc-context";

type AdminStatus = "ACTIVE" | "DISABLED";

export async function onGetAdminProfiles() {
  const { db } = requireAdmin();
  return db
    .select({
      userId: adminProfile.userId,
      email: user.email,
      name: user.name,
      status: adminProfile.status,
      twoFactorEnabled: adminProfile.twoFactorEnabled,
      createdAt: adminProfile.createdAt,
      updatedAt: adminProfile.updatedAt,
    })
    .from(adminProfile)
    .innerJoin(user, eq(adminProfile.userId, user.id))
    .orderBy(asc(adminProfile.createdAt), asc(user.email));
}

export async function onSetAdminStatus(input: { userId: string; status: AdminStatus }) {
  const { db, adminUserId } = requireAdmin();
  const userId = input.userId.trim();
  if (!userId) appError("ADMIN_NOT_FOUND");
  if (userId === adminUserId) appError("ADMIN_SELF_STATUS_CHANGE_FORBIDDEN");

  const [profile] = await db
    .select({ status: adminProfile.status })
    .from(adminProfile)
    .where(eq(adminProfile.userId, userId))
    .limit(1);
  if (!profile) appError("ADMIN_NOT_FOUND");
  if (profile.status === input.status) return { userId, status: input.status };

  if (input.status === "DISABLED") {
    const [activeAdminCount] = await db
      .select({ value: count() })
      .from(adminProfile)
      .where(eq(adminProfile.status, "ACTIVE"));
    if ((activeAdminCount?.value ?? 0) <= 1) appError("LAST_ACTIVE_ADMIN_REQUIRED");
  }

  const now = new Date();
  const activeAdminGuard = input.status === "DISABLED"
    ? sql`(SELECT count(*) FROM adminProfile WHERE status = 'ACTIVE') > 1`
    : undefined;
  const [updated] = await db
    .update(adminProfile)
    .set({ status: input.status, updatedAt: now })
    .where(and(eq(adminProfile.userId, userId), eq(adminProfile.status, profile.status), activeAdminGuard))
    .returning({ userId: adminProfile.userId, status: adminProfile.status });
  if (!updated) appError("ADMIN_STATUS_CHANGED_RETRY");

  await db.insert(adminOperationLog).values({
    adminUserId,
    action: "SET_ADMIN_STATUS",
    targetType: "adminProfile",
    targetId: userId,
    detail: `status=${input.status}`,
    createdAt: now,
  });
  return updated;
}
