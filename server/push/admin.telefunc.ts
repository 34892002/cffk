import { and, count, desc, eq } from "drizzle-orm";
import { pushConfig, pushLog } from "@/database/drizzle/schema";
import { requireAdmin } from "@/server/telefunc-context";

export type PushScene = "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED";
export type PushChannel = "EMAIL" | "WECOM" | "TELEGRAM";

type PushConfigInput = {
  isEnabled: boolean;
  emailEnabled: boolean;
  wecomEnabled: boolean;
  telegramEnabled: boolean;
  customerOrderPaid: boolean;
  customerDeliverySuccess: boolean;
  customerDeliveryFailed: boolean;
  adminOrderPaid: boolean;
  adminDeliverySuccess: boolean;
  adminDeliveryFailed: boolean;
};

const defaultConfig: PushConfigInput = {
  isEnabled: true,
  emailEnabled: true,
  wecomEnabled: false,
  telegramEnabled: false,
  customerOrderPaid: true,
  customerDeliverySuccess: true,
  customerDeliveryFailed: false,
  adminOrderPaid: false,
  adminDeliverySuccess: true,
  adminDeliveryFailed: true,
};

async function getOrCreateConfig() {
  const { db } = requireAdmin();
  const [current] = await db.select().from(pushConfig).where(eq(pushConfig.id, 1)).limit(1);
  if (current) return current;

  const now = new Date();
  await db.insert(pushConfig).values({ id: 1, ...defaultConfig, createdAt: now, updatedAt: now }).onConflictDoNothing();
  const [created] = await db.select().from(pushConfig).where(eq(pushConfig.id, 1)).limit(1);
  if (!created) throw new Error("PUSH_CONFIG_UNAVAILABLE");
  return created;
}

export async function onGetPushConfig() {
  return getOrCreateConfig();
}

export async function onSavePushConfig(input: PushConfigInput) {
  const { db } = requireAdmin();
  const now = new Date();
  await db.insert(pushConfig).values({ id: 1, ...input, createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: pushConfig.id,
    set: { ...input, updatedAt: now },
  });

  return getOrCreateConfig();
}

export async function onGetPushLogs(input?: { page?: number; pageSize?: number; status?: "SUCCESS" | "FAILED"; channel?: PushChannel }) {
  const { db } = requireAdmin();
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input?.pageSize ?? 20)));
  const conditions = [
    ...(input?.status ? [eq(pushLog.status, input.status)] : []),
    ...(input?.channel ? [eq(pushLog.channel, input.channel)] : []),
  ];
  const where = conditions.length ? and(...conditions) : undefined;
  const [logs, total] = await Promise.all([
    db.select().from(pushLog).where(where).orderBy(desc(pushLog.createdAt), desc(pushLog.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(pushLog).where(where),
  ]);
  return { logs, total: total[0]?.value ?? 0, page, pageSize };
}
