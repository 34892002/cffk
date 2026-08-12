import { telefuncAction } from "@/server/telefunc-action";
import { and, count, desc, eq, gte, like, lt } from "drizzle-orm";
import { emailTemplate, order, pushChannelConfig, pushConfig, pushLog, pushPolicy, pushRetry } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { formatDateInTimezone } from "@/lib/site-timezone";
import { parseEmailProviderConfig, parseEmailTemplateConfig } from "@/lib/config-schemas";
import { getSiteSettings } from "@/server/site/public-settings";
import { requireAdmin } from "@/server/telefunc-context";
import { emailTemplateDefinitions } from "@/server/email/template-definitions";

export type PushScene = "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED" | "PAYMENT_EXCEPTION";
export type PushChannel = "EMAIL" | "WECHAT" | "TELEGRAM";
export type PushMessageType = "NORMAL" | "ADMIN";
export type PushStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "SKIPPED" | "EXHAUSTED";
type Policy = { messageType: PushMessageType; scene: PushScene; channels: PushChannel[]; isEnabled: boolean };
type SaveInput = { isEnabled: boolean; policies: Policy[] };


const pushChannels = new Set<PushChannel>(["EMAIL", "WECHAT", "TELEGRAM"]);
const pushMessageTypes = new Set<PushMessageType>(["NORMAL", "ADMIN"]);
const pushScenes = new Set<PushScene>(["ORDER_PAID", "DELIVERY_SUCCESS", "DELIVERY_FAILED", "PAYMENT_EXCEPTION"]);
const pushStatuses = new Set<PushStatus>(["PENDING", "PROCESSING", "SUCCESS", "FAILED", "SKIPPED", "EXHAUSTED"]);

const defaultPolicies: Policy[] = [
  { messageType: "NORMAL", scene: "ORDER_PAID", channels: ["EMAIL"], isEnabled: true },
  { messageType: "NORMAL", scene: "DELIVERY_SUCCESS", channels: ["EMAIL"], isEnabled: true },
  { messageType: "NORMAL", scene: "DELIVERY_FAILED", channels: [], isEnabled: true },
  { messageType: "ADMIN", scene: "ORDER_PAID", channels: [], isEnabled: true },
  { messageType: "ADMIN", scene: "DELIVERY_SUCCESS", channels: ["EMAIL"], isEnabled: true },
  { messageType: "ADMIN", scene: "DELIVERY_FAILED", channels: ["EMAIL"], isEnabled: true },
  { messageType: "NORMAL", scene: "PAYMENT_EXCEPTION", channels: [], isEnabled: false },
  { messageType: "ADMIN", scene: "PAYMENT_EXCEPTION", channels: ["EMAIL"], isEnabled: true },
];

function key(policy: Pick<Policy, "messageType" | "scene">) { return `${policy.messageType}:${policy.scene}`; }
function parseChannels(value: string): PushChannel[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => item !== "EMAIL" && item !== "WECHAT" && item !== "TELEGRAM")) return [];
    return [...new Set(parsed)] as PushChannel[];
  } catch { return []; }
}

async function ensureConfig() {
  const { db } = requireAdmin();
  const now = new Date();
  await db.insert(pushConfig).values({ id: 1, isEnabled: true, createdAt: now, updatedAt: now }).onConflictDoNothing();
  for (const policy of defaultPolicies) {
    await db.insert(pushPolicy).values({ ...policy, channelsJson: JSON.stringify(policy.channels), createdAt: now, updatedAt: now }).onConflictDoNothing();
  }
}

async function channelAvailability() {
  const { db } = requireAdmin();
  const [providers, templates] = await Promise.all([
    db.select({ configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(and(eq(pushChannelConfig.channel, "EMAIL"), eq(pushChannelConfig.isEnabled, true))).limit(1),
    db.select({ scene: emailTemplate.scene, templateJson: emailTemplate.templateJson }).from(emailTemplate),
  ]);
  let emailConfigured = false;
  try { emailConfigured = Boolean(providers[0] && ["cloudflare", "api", "smtp"].includes(parseEmailProviderConfig(providers[0].configJson).kind)); } catch { /* Invalid configuration is unavailable. */ }
  const templateScenes = new Set(templates.filter((item) => item.scene !== "TEST").filter((item) => {
    try { parseEmailTemplateConfig(item.templateJson); return emailTemplateDefinitions.some((definition) => definition.scene === item.scene); } catch { return false; }
  }).map((item) => item.scene));
  return {
    EMAIL: { available: emailConfigured, reason: emailConfigured ? null : "请先在邮件通道配置中启用有效 Provider。", templateScenes: [...templateScenes] },
    WECHAT: { available: false, reason: "微信 Provider 尚未接入。", templateScenes: [] as string[] },
    TELEGRAM: { available: false, reason: "Telegram Provider 尚未接入。", templateScenes: [] as string[] },
  };
}

async function internalOnGetPushConfig() {
  await ensureConfig();
  const { db } = requireAdmin();
  const [[config], records, channels] = await Promise.all([
    db.select({ isEnabled: pushConfig.isEnabled }).from(pushConfig).where(eq(pushConfig.id, 1)).limit(1),
    db.select().from(pushPolicy),
    channelAvailability(),
  ]);
  const saved = new Map(records.map((record) => [key(record), { messageType: record.messageType, scene: record.scene, channels: parseChannels(record.channelsJson), isEnabled: record.isEnabled }]));
  return { isEnabled: config?.isEnabled ?? true, policies: defaultPolicies.map((policy) => saved.get(key(policy)) ?? policy), channels };
}

async function internalOnSavePushConfig(input: SaveInput) {
  if (typeof input?.isEnabled !== "boolean" || !Array.isArray(input.policies)) appError("PUSH_POLICY_INVALID");
  const expected = new Set(defaultPolicies.map(key));
  if (input.policies.length !== expected.size || input.policies.some((policy) => !expected.has(key(policy)) || typeof policy.isEnabled !== "boolean" || !Array.isArray(policy.channels))) appError("PUSH_POLICY_INVALID");
  for (const policy of input.policies) {
    const channels = [...new Set(policy.channels)];
    if (channels.some((channel) => channel !== "EMAIL" && channel !== "WECHAT" && channel !== "TELEGRAM")) appError("PUSH_POLICY_INVALID");
    if (policy.messageType === "NORMAL" && channels.some((channel) => channel !== "EMAIL")) appError("PUSH_POLICY_CHANNEL_FORBIDDEN");
    if (channels.some((channel) => channel !== "EMAIL")) appError("PUSH_POLICY_CHANNEL_UNAVAILABLE");
  }
  const { db } = requireAdmin();
  const now = new Date();
  await db.insert(pushConfig).values({ id: 1, isEnabled: input.isEnabled, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: pushConfig.id, set: { isEnabled: input.isEnabled, updatedAt: now } });
  for (const policy of input.policies) await db.insert(pushPolicy).values({ ...policy, channelsJson: JSON.stringify(policy.channels), createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [pushPolicy.messageType, pushPolicy.scene], set: { channelsJson: JSON.stringify(policy.channels), isEnabled: policy.isEnabled, updatedAt: now } });
  return internalOnGetPushConfig();
}

async function internalOnRetryPushLog(id: number) {
  if (!Number.isInteger(id) || id <= 0) appError("PUSH_LOG_NOT_RETRYABLE");
  const { database, db, adminUserId } = requireAdmin();
  const [log] = await db.select().from(pushLog).where(eq(pushLog.id, id)).limit(1);
  if (!log || log.channel !== "EMAIL" || (log.status !== "FAILED" && log.status !== "EXHAUSTED") || !log.channelConfigId) appError("PUSH_LOG_NOT_RETRYABLE");
  const now = new Date();
  const settings = log.orderId ? null : await getSiteSettings(database);
  const payload = JSON.stringify({
    input: {
      scene: log.scene,
      messageType: log.messageType,
      ...(log.orderId ? { orderId: log.orderId } : {}),
      variables: log.orderId ? {} : { siteName: settings!.siteName, sentAt: formatDateInTimezone(now, settings!.timezone, { dateStyle: "medium", timeStyle: "medium" }), customContent: "这是一封重试测试邮件。" },
      source: `admin:retry:${adminUserId}:${id}`,
      providerConfigId: log.channelConfigId,
    },
    recipient: log.recipient,
  });
  if (log.orderId) {
    const { orderPushVariables } = await import("./service");
    const variables = await orderPushVariables(requireAdmin().database, log.orderId);
    if (!variables) appError("PUSH_LOG_NOT_RETRYABLE");
    const parsed = JSON.parse(payload) as { input: { variables: Record<string, string | number> } };
    parsed.input.variables = variables;
    await db.insert(pushRetry).values({ pushLogId: id, payloadJson: JSON.stringify(parsed), status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: now, lastError: null, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: pushRetry.pushLogId, set: { payloadJson: JSON.stringify(parsed), status: "PENDING", attemptCount: 0, nextAttemptAt: now, lastError: null, updatedAt: now } });
  } else {
    await db.insert(pushRetry).values({ pushLogId: id, payloadJson: payload, status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: now, lastError: null, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: pushRetry.pushLogId, set: { payloadJson: payload, status: "PENDING", attemptCount: 0, nextAttemptAt: now, lastError: null, updatedAt: now } });
  }
  await db.update(pushLog).set({ status: "PENDING", attemptCount: 0, error: null, messageId: null, triggeredBy: `admin:retry:${adminUserId}`, updatedAt: now }).where(eq(pushLog.id, id));
  return { id };
}

async function internalOnGetPushLogs(input?: { page?: number; pageSize?: number; status?: PushStatus; channel?: PushChannel; messageType?: PushMessageType; scene?: PushScene; orderId?: number; orderNo?: string; from?: string; to?: string }) {
  const { db } = requireAdmin();
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input?.pageSize ?? 20)));
  const orderNo = input?.orderNo?.trim().slice(0, 128);
  if (input?.channel && !pushChannels.has(input.channel)) appError("PUSH_LOG_FILTER_INVALID");
  if (input?.messageType && !pushMessageTypes.has(input.messageType)) appError("PUSH_LOG_FILTER_INVALID");
  if (input?.scene && !pushScenes.has(input.scene)) appError("PUSH_LOG_FILTER_INVALID");
  if (input?.status && !pushStatuses.has(input.status)) appError("PUSH_LOG_FILTER_INVALID");
  if (input?.orderId !== undefined && (!Number.isInteger(input.orderId) || input.orderId < 1)) appError("PUSH_LOG_FILTER_INVALID");
  const from = input?.from ? new Date(input.from) : null;
  const to = input?.to ? new Date(input.to) : null;
  if (from && Number.isNaN(from.getTime())) appError("PUSH_LOG_DATE_INVALID");
  if (to && Number.isNaN(to.getTime())) appError("PUSH_LOG_DATE_INVALID");
  if (from && to && from >= to) appError("PUSH_LOG_DATE_INVALID");
  const conditions = [...(input?.status ? [eq(pushLog.status, input.status)] : []), ...(input?.channel ? [eq(pushLog.channel, input.channel)] : []), ...(input?.messageType ? [eq(pushLog.messageType, input.messageType)] : []), ...(input?.scene ? [eq(pushLog.scene, input.scene)] : []), ...(typeof input?.orderId === "number" ? [eq(pushLog.orderId, input.orderId)] : []), ...(orderNo ? [like(order.orderNo, `%${orderNo}%`)] : []), ...(from ? [gte(pushLog.createdAt, from)] : []), ...(to ? [lt(pushLog.createdAt, to)] : [])];
  const where = conditions.length ? and(...conditions) : undefined;
  const [logs, total] = await Promise.all([
    db.select({ id: pushLog.id, orderId: pushLog.orderId, channelConfigId: pushLog.channelConfigId, idempotencyKey: pushLog.idempotencyKey, messageType: pushLog.messageType, channel: pushLog.channel, provider: pushLog.provider, scene: pushLog.scene, recipient: pushLog.recipient, subject: pushLog.subject, status: pushLog.status, attemptCount: pushLog.attemptCount, messageId: pushLog.messageId, error: pushLog.error, triggeredBy: pushLog.triggeredBy, createdAt: pushLog.createdAt, updatedAt: pushLog.updatedAt, orderNo: order.orderNo }).from(pushLog).leftJoin(order, eq(pushLog.orderId, order.id)).where(where).orderBy(desc(pushLog.createdAt), desc(pushLog.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(pushLog).leftJoin(order, eq(pushLog.orderId, order.id)).where(where),
  ]);
  return { logs, total: total[0]?.value ?? 0, page, pageSize };
}

export const onGetPushConfig = telefuncAction(internalOnGetPushConfig);
export const onSavePushConfig = telefuncAction(internalOnSavePushConfig);
export const onRetryPushLog = telefuncAction(internalOnRetryPushLog);
export const onGetPushLogs = telefuncAction(internalOnGetPushLogs);
