import { and, eq, lte, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { adminBootstrap, emailTemplate, order, orderDelivery, pushChannelConfig, pushLog, pushPolicy, pushRetry, siteSetting, user } from "@/database/drizzle/schema";
import { parseEmailTemplateConfig } from "@/lib/config-schemas";
import { parseEmailProviderConfigForKind, type EmailProviderKind } from "@/server/push/provider-definitions";
import { parseThirdPartyProviderConfig, sendThirdPartyPush } from "@/server/push/third-party-provider";
import { parseTelegramProviderConfig, sendTelegramPush } from "@/server/push/telegram-provider";
import { buildSmtpMessage, buildSmtpTransport, parseEmailApiSuccessResponse, PUSH_MAX_ATTEMPTS, pushRetryDelayMs, renderPushTemplate, smtpSendError } from "@/lib/push-utils";
import { sanitizeDatabaseLogText } from "@/server/database-log-sanitizer";

import type { PushChannel, PushDispatchInput, PushDispatchResult, PushRecipient } from "./types";

type Runtime = Record<string, unknown> & { EMAIL?: CloudflareEmailBinding };

type CloudflareEmailBinding = {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string | { email: string; name?: string };
  }): Promise<{ messageId: string }>;
};

const DEFAULT_API_TIMEOUT_MS = 15_000;
const PUSH_PROCESSING_LEASE_MS = 10 * 60 * 1000;
const directRecipientScenes = new Set<PushDispatchInput["scene"]>([
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "GUEST_ORDER_RECOVERY",
]);

const defaultPolicyChannels: Partial<Record<PushDispatchInput["messageType"], Partial<Record<PushDispatchInput["scene"], readonly PushChannel[]>>>> = {
  NORMAL: {
    ORDER_PAID: ["EMAIL"],
    DELIVERY_SUCCESS: ["EMAIL"],
  },
  ADMIN: {
    ORDER_PAID: [],
    DELIVERY_SUCCESS: ["EMAIL"],
    DELIVERY_FAILED: ["EMAIL"],
    PAYMENT_EXCEPTION: ["EMAIL"],
  },
};

function isEmail(value: string | null | undefined) {
  return /^\S+@\S+\.\S+$/.test(value?.trim() ?? "");
}

function parsePolicyChannels(channelsJson: string): PushChannel[] {
  try {
    const value = JSON.parse(channelsJson) as unknown;
    return Array.isArray(value) ? value.filter((item): item is PushChannel => item === "EMAIL" || item === "WECHAT" || item === "TELEGRAM") : [];
  } catch { return []; }
}

async function policyChannels(database: D1Database, input: PushDispatchInput): Promise<PushChannel[]> {
  if (input.scene === "TEST" || (input.recipient && directRecipientScenes.has(input.scene))) return ["EMAIL"];
  if (directRecipientScenes.has(input.scene)) return [];
  const scene = input.scene as "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED" | "PAYMENT_EXCEPTION";
  const [policy] = await createDrizzleDb(database).select({ isEnabled: pushPolicy.isEnabled, channelsJson: pushPolicy.channelsJson }).from(pushPolicy).where(and(eq(pushPolicy.messageType, input.messageType), eq(pushPolicy.scene, scene))).limit(1);
  if (!policy) return [...(defaultPolicyChannels[input.messageType]?.[input.scene] ?? [])];
  return policy.isEnabled ? parsePolicyChannels(policy.channelsJson) : [];
}

async function recipients(database: D1Database, input: PushDispatchInput): Promise<PushRecipient[]> {
  if (input.recipient) return [input.recipient];
  if (input.messageType === "ADMIN") {
    const rows = await createDrizzleDb(database).select({ email: user.email }).from(adminBootstrap).innerJoin(user, eq(adminBootstrap.userId, user.id)).where(eq(adminBootstrap.id, 1));
    return rows.filter((row) => isEmail(row.email)).map((row) => ({ type: "ADMIN" as const, address: row.email.trim() }));
  }
  if (!input.orderId) return [];
  const [record] = await createDrizzleDb(database).select({ contactType: order.contactType, contactValue: order.contactValue }).from(order).where(eq(order.id, input.orderId)).limit(1);
  return record?.contactType === "EMAIL" && isEmail(record.contactValue) ? [{ type: "CUSTOMER", address: record.contactValue!.trim() }] : [];
}

function idempotencyKey(input: PushDispatchInput, channel: PushChannel, recipient: string) {
  return `${input.source}:${input.orderId ?? "test"}:${input.messageType}:${input.scene}:${channel}:${recipient}`;
}

type AcquiredTask = { taskId: number; duplicateResult?: PushDispatchResult };

async function acquireTask(database: D1Database, input: PushDispatchInput, channel: PushChannel, recipient: string): Promise<AcquiredTask> {
  const now = new Date();
  const key = idempotencyKey(input, channel, recipient);
  const db = createDrizzleDb(database);
  const result = await db.insert(pushLog).values({
    orderId: input.orderId ?? null,
    idempotencyKey: key,
    messageType: input.messageType,
    channel,
    provider: "UNAVAILABLE",
    scene: input.scene,
    recipient,
    status: "PENDING",
    triggeredBy: input.source,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning({ id: pushLog.id });
  if (result[0]) return { taskId: result[0].id };

  const [existing] = await db.select({ id: pushLog.id, status: pushLog.status, messageId: pushLog.messageId, error: pushLog.error }).from(pushLog).where(eq(pushLog.idempotencyKey, key)).limit(1);
  if (!existing) throw new Error("PUSH_LOG_IDEMPOTENCY_CONFLICT");
  if (existing.status === "SUCCESS") return { taskId: existing.id, duplicateResult: { channel, recipient, status: "SKIPPED", reason: "DUPLICATE_SUCCESS", messageId: existing.messageId ?? undefined } };
  if (existing.status === "SKIPPED") return { taskId: existing.id, duplicateResult: { channel, recipient, status: "SKIPPED", reason: existing.error ?? "DUPLICATE_SKIPPED" } };
  if (existing.status === "FAILED" || existing.status === "EXHAUSTED") return { taskId: existing.id, duplicateResult: { channel, recipient, status: "FAILED", reason: existing.error ?? "PUSH_SEND_FAILED", terminal: true } };
  const [retry] = await db.select({ status: pushRetry.status }).from(pushRetry).where(eq(pushRetry.pushLogId, existing.id)).limit(1);
  if (retry) return { taskId: existing.id, duplicateResult: { channel, recipient, status: "FAILED", reason: existing.error ?? "PUSH_RETRY_PENDING", retryScheduled: retry.status !== "EXHAUSTED", terminal: retry.status === "EXHAUSTED" } };
  return { taskId: existing.id };
}

async function writeResult(database: D1Database, taskId: number, status: "SUCCESS" | "SKIPPED" | "FAILED" | "EXHAUSTED", attemptCount: number, fields: { provider?: string; subject?: string; messageId?: string; error?: string }) {
  await createDrizzleDb(database).update(pushLog).set({
    provider: fields.provider ?? "UNAVAILABLE",
    subject: fields.subject ?? null,
    status,
    attemptCount,
    messageId: fields.messageId ?? null,
    error: fields.error ? sanitizeDatabaseLogText(fields.error) : null,
    updatedAt: new Date(),
  }).where(eq(pushLog.id, taskId));
}

function isRetryableError(reason: string) {
  return reason === "EMAIL_SEND_RETRYABLE"
    || reason === "EMAIL_CLOUDFLARE_RATE_LIMITED"
    || reason === "EMAIL_CLOUDFLARE_FAILED"
    || reason === "THIRD_PARTY_SEND_RETRYABLE"
    || reason === "TELEGRAM_SEND_RETRYABLE"
    || /network|timeout|temporar/i.test(reason);
}

function shouldAutoRetry(input: PushDispatchInput) {
  return input.scene !== "TEST" && !directRecipientScenes.has(input.scene);
}

export function cloudflareEmailError(cause: unknown) {
  const record = typeof cause === "object" && cause !== null ? cause as { code?: unknown; message?: unknown } : undefined;
  const code = typeof record?.code === "string" ? record.code : "";
  const message = cause instanceof Error ? cause.message : typeof record?.message === "string" ? record.message : String(cause);
  const detail = `${code} ${message}`;
  if (detail.includes("E_RATE_LIMIT_EXCEEDED")) return "EMAIL_CLOUDFLARE_RATE_LIMITED";
  if (detail.includes("E_INTERNAL_SERVER_ERROR") || detail.includes("E_DELIVERY_FAILED")) return "EMAIL_CLOUDFLARE_FAILED";
  if (detail.includes("E_SENDER_NOT_VERIFIED")) return "EMAIL_CLOUDFLARE_SENDER_NOT_VERIFIED";
  if (detail.includes("E_SENDER_DOMAIN_NOT_AVAILABLE")) return "EMAIL_CLOUDFLARE_SENDER_DOMAIN_UNAVAILABLE";
  if (detail.includes("E_RECIPIENT_NOT_ALLOWED")) return "EMAIL_CLOUDFLARE_RECIPIENT_NOT_ALLOWED";
  if (detail.includes("E_RECIPIENT_SUPPRESSED")) return "EMAIL_CLOUDFLARE_RECIPIENT_SUPPRESSED";
  if (detail.includes("E_CONTENT_TOO_LARGE")) return "EMAIL_CLOUDFLARE_CONTENT_TOO_LARGE";
  if (detail.includes("E_FIELD_MISSING") || detail.includes("E_VALIDATION_ERROR")) return "EMAIL_CLOUDFLARE_INVALID";
  return "EMAIL_CLOUDFLARE_FAILED";
}

async function postEmailApi(endpoint: string, headers: Record<string, string>, body: string, timeoutMs: number) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(endpoint, { method: "POST", headers, body, signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") throw new Error("EMAIL_SEND_RETRYABLE");
    throw new Error("EMAIL_SEND_RETRYABLE");
  }
}

type RetryPayload = { channel: PushChannel; input: PushDispatchInput; recipient: string };

function parseRetryPayload(value: string): RetryPayload | null {
  try {
    const payload = JSON.parse(value) as Partial<RetryPayload>;
    if (!payload.input || typeof payload.recipient !== "string" || !payload.channel || !["EMAIL", "WECHAT", "TELEGRAM"].includes(payload.channel)) return null;
    return payload as RetryPayload;
  } catch {
    return null;
  }
}

async function schedulePushRetry(database: D1Database, input: {
  channel: PushChannel;
  taskId: number;
  dispatchInput: PushDispatchInput;
  recipient: string;
  providerConfigId: number;
  reason: string;
  attemptCount: number;
}) {
  const retryable = isRetryableError(input.reason);
  const exhausted = !retryable || input.attemptCount >= PUSH_MAX_ATTEMPTS;
  const now = new Date();
  await createDrizzleDb(database).insert(pushRetry).values({
    pushLogId: input.taskId,
    payloadJson: JSON.stringify({ channel: input.channel, input: { ...input.dispatchInput, providerConfigId: input.providerConfigId }, recipient: input.recipient }),
    status: exhausted ? "EXHAUSTED" : "PENDING",
    attemptCount: input.attemptCount,
    maxAttempts: PUSH_MAX_ATTEMPTS,
    nextAttemptAt: new Date(now.getTime() + pushRetryDelayMs(input.attemptCount)),
    lastError: sanitizeDatabaseLogText(input.reason),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: pushRetry.pushLogId,
    set: {
      payloadJson: JSON.stringify({ channel: input.channel, input: { ...input.dispatchInput, providerConfigId: input.providerConfigId }, recipient: input.recipient }),
      status: exhausted ? "EXHAUSTED" : "PENDING",
      attemptCount: input.attemptCount,
      maxAttempts: PUSH_MAX_ATTEMPTS,
      nextAttemptAt: new Date(now.getTime() + pushRetryDelayMs(input.attemptCount)),
      lastError: sanitizeDatabaseLogText(input.reason),
      updatedAt: now,
    },
  });
  await createDrizzleDb(database).update(pushLog).set({
    status: exhausted ? (retryable ? "EXHAUSTED" : "FAILED") : "PENDING",
    attemptCount: input.attemptCount,
    error: sanitizeDatabaseLogText(input.reason),
    updatedAt: now,
  }).where(eq(pushLog.id, input.taskId));
  return !exhausted;
}

export async function renderPushMessageTemplate(database: D1Database, input: Pick<PushDispatchInput, "scene" | "variables">) {
  const [templateRecord] = await createDrizzleDb(database).select({ templateJson: emailTemplate.templateJson }).from(emailTemplate).where(eq(emailTemplate.scene, input.scene)).limit(1);
  if (!templateRecord) throw new Error("EMAIL_TEMPLATE_NOT_AVAILABLE");
  const template = parseEmailTemplateConfig(templateRecord.templateJson);
  return {
    title: renderPushTemplate(template.subject, input.variables),
    content: renderPushTemplate(template.body, input.variables),
  };
}

async function sendEmail(database: D1Database, runtime: Runtime, input: PushDispatchInput, recipient: string, existingTaskId?: number, attemptCount = 1): Promise<PushDispatchResult> {
  const acquired = existingTaskId === undefined ? await acquireTask(database, input, "EMAIL", recipient) : { taskId: existingTaskId };
  if (acquired.duplicateResult) return acquired.duplicateResult;
  const taskId = acquired.taskId;
  const db = createDrizzleDb(database);
  const [providerRecord] = await db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(input.providerConfigId ? and(eq(pushChannelConfig.id, input.providerConfigId), eq(pushChannelConfig.channel, "EMAIL")) : and(eq(pushChannelConfig.channel, "EMAIL"), eq(pushChannelConfig.isEnabled, true))).limit(1);
  if (!providerRecord) {
    const reason = "CHANNEL_NOT_AVAILABLE";
    await writeResult(database, taskId, "SKIPPED", attemptCount, { error: reason });
    return { channel: "EMAIL", recipient, status: "SKIPPED", reason };
  }
  await db.update(pushLog).set({ channelConfigId: providerRecord.id, provider: providerRecord.provider, updatedAt: new Date() }).where(eq(pushLog.id, taskId));
  try {
    if (providerRecord.provider !== "API" && providerRecord.provider !== "SMTP" && providerRecord.provider !== "CLOUDFLARE") throw new Error("EMAIL_PROVIDER_INVALID");
    const provider = parseEmailProviderConfigForKind(providerRecord.provider as EmailProviderKind, providerRecord.configJson);
    const { title: subject, content: body } = await renderPushMessageTemplate(database, input);
    let result: { messageId?: string };
    if (provider.kind === "cloudflare") {
      const sender = runtime.EMAIL;
      if (!sender || typeof sender.send !== "function") throw new Error("EMAIL_CLOUDFLARE_BINDING_UNAVAILABLE");
      try {
        result = await sender.send({
          to: recipient,
          from: provider.fromName ? { email: provider.from, name: provider.fromName } : provider.from,
          subject,
          text: body,
          ...(provider.replyTo ? { replyTo: provider.replyTo } : {}),
        });
      } catch (cause) {
        throw new Error(cloudflareEmailError(cause));
      }
    } else if (provider.kind === "api") {
      const apiKey = provider.apiKey;
      const endpoint = provider.apiProvider === "RESEND" ? `${provider.endpoint.replace(/\/+$/, "")}/emails` : provider.endpoint;
      const headers: Record<string, string> = provider.apiProvider === "RESEND" ? { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" } : { "api-key": apiKey, "content-type": "application/json" };
      const from = provider.fromName ? `${provider.fromName} <${provider.from}>` : provider.from;
      const response = await postEmailApi(endpoint, headers, JSON.stringify(provider.apiProvider === "RESEND" ? { from, to: [recipient], ...(provider.replyTo ? { reply_to: provider.replyTo } : {}), subject, text: body } : { sender: { email: provider.from, ...(provider.fromName ? { name: provider.fromName } : {}) }, to: [{ email: recipient }], ...(provider.replyTo ? { replyTo: { email: provider.replyTo } } : {}), subject, textContent: body }), provider.timeoutMs ?? DEFAULT_API_TIMEOUT_MS);
      if (!response.ok) throw new Error(response.status === 429 || response.status >= 500 ? "EMAIL_SEND_RETRYABLE" : "EMAIL_SEND_FAILED");
      result = parseEmailApiSuccessResponse(await response.text());
    } else {
      const { WorkerMailer } = await import("worker-mailer");
      try {
        await WorkerMailer.send(
          buildSmtpTransport(provider),
          buildSmtpMessage({ from: provider.from, fromName: provider.fromName, to: recipient, replyTo: provider.replyTo, subject, body }),
        );
      } catch (cause) {
        throw new Error(smtpSendError(cause));
      }
      result = {};
    }
    await writeResult(database, taskId, "SUCCESS", attemptCount, { provider: providerRecord.provider, subject, messageId: result.messageId });
    return { channel: "EMAIL", recipient, status: "SUCCESS", messageId: result.messageId };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "EMAIL_SEND_FAILED";
    await writeResult(database, taskId, "FAILED", attemptCount, { provider: providerRecord.provider, error: reason });
    if (existingTaskId === undefined && shouldAutoRetry(input)) {
      const retryScheduled = await schedulePushRetry(database, { channel: "EMAIL", taskId, dispatchInput: input, recipient, providerConfigId: providerRecord.id, reason, attemptCount });
      return { channel: "EMAIL", recipient, status: "FAILED", reason, retryScheduled, terminal: !retryScheduled };
    }
    return { channel: "EMAIL", recipient, status: "FAILED", reason, terminal: true };
  }
}

export async function sendWechat(database: D1Database, input: PushDispatchInput, existingTaskId?: number, attemptCount = 1): Promise<PushDispatchResult> {
  const recipient = "管理员";
  const acquired = existingTaskId === undefined ? await acquireTask(database, input, "WECHAT", recipient) : { taskId: existingTaskId };
  if (acquired.duplicateResult) return acquired.duplicateResult;
  const taskId = acquired.taskId;
  const db = createDrizzleDb(database);
  const [providerRecord] = await db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(input.providerConfigId ? and(eq(pushChannelConfig.id, input.providerConfigId), eq(pushChannelConfig.channel, "WECHAT")) : and(eq(pushChannelConfig.channel, "WECHAT"), eq(pushChannelConfig.isEnabled, true))).limit(1);
  if (!providerRecord) {
    await writeResult(database, taskId, "SKIPPED", attemptCount, { error: "CHANNEL_NOT_AVAILABLE" });
    return { channel: "WECHAT", recipient, status: "SKIPPED", reason: "CHANNEL_NOT_AVAILABLE" };
  }
  await db.update(pushLog).set({ channelConfigId: providerRecord.id, provider: providerRecord.provider, updatedAt: new Date() }).where(eq(pushLog.id, taskId));
  try {
    const message = await renderPushMessageTemplate(database, input);
    const result = await sendThirdPartyPush(parseThirdPartyProviderConfig(providerRecord.configJson), message);
    await writeResult(database, taskId, "SUCCESS", attemptCount, { provider: providerRecord.provider, subject: message.title, messageId: result.messageId });
    return { channel: "WECHAT", recipient, status: "SUCCESS", messageId: result.messageId };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "THIRD_PARTY_SEND_FAILED";
    await writeResult(database, taskId, "FAILED", attemptCount, { provider: providerRecord.provider, error: reason });
    if (existingTaskId === undefined && shouldAutoRetry(input)) {
      const retryScheduled = await schedulePushRetry(database, { channel: "WECHAT", taskId, dispatchInput: input, recipient, providerConfigId: providerRecord.id, reason, attemptCount });
      return { channel: "WECHAT", recipient, status: "FAILED", reason, retryScheduled, terminal: !retryScheduled };
    }
    return { channel: "WECHAT", recipient, status: "FAILED", reason, terminal: true };
  }
}

export async function sendTelegram(database: D1Database, input: PushDispatchInput, existingTaskId?: number, attemptCount = 1): Promise<PushDispatchResult> {
  const recipient = "管理员";
  const acquired = existingTaskId === undefined ? await acquireTask(database, input, "TELEGRAM", recipient) : { taskId: existingTaskId };
  if (acquired.duplicateResult) return acquired.duplicateResult;
  const taskId = acquired.taskId;
  const db = createDrizzleDb(database);
  const [providerRecord] = await db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(input.providerConfigId ? and(eq(pushChannelConfig.id, input.providerConfigId), eq(pushChannelConfig.channel, "TELEGRAM")) : and(eq(pushChannelConfig.channel, "TELEGRAM"), eq(pushChannelConfig.isEnabled, true))).limit(1);
  if (!providerRecord) {
    await writeResult(database, taskId, "SKIPPED", attemptCount, { error: "CHANNEL_NOT_AVAILABLE" });
    return { channel: "TELEGRAM", recipient, status: "SKIPPED", reason: "CHANNEL_NOT_AVAILABLE" };
  }
  await db.update(pushLog).set({ channelConfigId: providerRecord.id, provider: providerRecord.provider, updatedAt: new Date() }).where(eq(pushLog.id, taskId));
  try {
    const message = await renderPushMessageTemplate(database, input);
    const result = await sendTelegramPush(parseTelegramProviderConfig(providerRecord.configJson), message);
    await writeResult(database, taskId, "SUCCESS", attemptCount, { provider: providerRecord.provider, subject: message.title, messageId: result.messageId });
    return { channel: "TELEGRAM", recipient, status: "SUCCESS", messageId: result.messageId };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "TELEGRAM_SEND_FAILED";
    await writeResult(database, taskId, "FAILED", attemptCount, { provider: providerRecord.provider, error: reason });
    if (existingTaskId === undefined && shouldAutoRetry(input)) {
      const retryScheduled = await schedulePushRetry(database, { channel: "TELEGRAM", taskId, dispatchInput: input, recipient, providerConfigId: providerRecord.id, reason, attemptCount });
      return { channel: "TELEGRAM", recipient, status: "FAILED", reason, retryScheduled, terminal: !retryScheduled };
    }
    return { channel: "TELEGRAM", recipient, status: "FAILED", reason, terminal: true };
  }
}

export async function dispatchPush(database: D1Database, runtime: Runtime, input: PushDispatchInput) {
  const [channels, targets] = await Promise.all([policyChannels(database, input), recipients(database, input)]);
  const tasks: Array<Promise<PushDispatchResult>> = [];
  if (channels.includes("EMAIL")) {
    if (!targets.length) tasks.push(Promise.resolve({ channel: "EMAIL", recipient: "", status: "SKIPPED", reason: "RECIPIENT_NOT_CONFIGURED" }));
    else tasks.push(...targets.map((target) => sendEmail(database, runtime, input, target.address)));
  }
  if (input.messageType === "ADMIN" && channels.includes("WECHAT")) tasks.push(sendWechat(database, input));
  if (input.messageType === "ADMIN" && channels.includes("TELEGRAM")) tasks.push(sendTelegram(database, input));
  return Promise.all(tasks);
}

export async function retryDuePushes(database: D1Database, runtime: Runtime, now = new Date(), limit = 50) {
  const db = createDrizzleDb(database);
  const exhaustedTimeouts = await db.select({ id: pushRetry.id, pushLogId: pushRetry.pushLogId, attemptCount: pushRetry.attemptCount }).from(pushRetry)
    .where(and(eq(pushRetry.status, "PROCESSING"), lte(pushRetry.nextAttemptAt, now), sql`${pushRetry.attemptCount} >= ${pushRetry.maxAttempts}`));
  for (const item of exhaustedTimeouts) {
    const [updated] = await db.update(pushRetry).set({ status: "EXHAUSTED", lastError: "PUSH_RETRY_PROCESSING_TIMEOUT", updatedAt: now })
      .where(and(eq(pushRetry.id, item.id), eq(pushRetry.status, "PROCESSING"), eq(pushRetry.attemptCount, item.attemptCount), lte(pushRetry.nextAttemptAt, now)))
      .returning({ id: pushRetry.id });
    if (updated) await writeResult(database, item.pushLogId, "EXHAUSTED", item.attemptCount, { error: "PUSH_RETRY_PROCESSING_TIMEOUT" });
  }
  await database.prepare("UPDATE pushRetry SET status = 'PENDING', lastError = 'PUSH_RETRY_PROCESSING_TIMEOUT', updatedAt = ? WHERE status = 'PROCESSING' AND nextAttemptAt <= ? AND attemptCount < maxAttempts").bind(now.getTime(), now.getTime()).run();
  const pending = await db.select().from(pushRetry)
    .where(and(eq(pushRetry.status, "PENDING"), lte(pushRetry.nextAttemptAt, now)))
    .limit(Math.min(100, Math.max(1, limit)));
  let attempted = 0;
  let sent = 0;
  let exhaustedCount = exhaustedTimeouts.length;

  for (const item of pending) {
    const nextAttemptCount = item.attemptCount + 1;
    const [claimed] = await db.update(pushRetry).set({ status: "PROCESSING", attemptCount: nextAttemptCount, nextAttemptAt: new Date(now.getTime() + PUSH_PROCESSING_LEASE_MS), updatedAt: now })
      .where(and(eq(pushRetry.id, item.id), eq(pushRetry.status, "PENDING"), eq(pushRetry.attemptCount, item.attemptCount)))
      .returning({ id: pushRetry.id });
    if (!claimed) continue;
    attempted += 1;

    const payload = parseRetryPayload(item.payloadJson);
    if (!payload || nextAttemptCount > item.maxAttempts) {
      await db.update(pushRetry).set({ status: "EXHAUSTED", lastError: "PUSH_RETRY_PAYLOAD_INVALID", updatedAt: now }).where(eq(pushRetry.id, item.id));
      await writeResult(database, item.pushLogId, "EXHAUSTED", nextAttemptCount, { error: "PUSH_RETRY_PAYLOAD_INVALID" });
      exhaustedCount += 1;
      continue;
    }

    await db.update(pushLog).set({ status: "PROCESSING", attemptCount: nextAttemptCount, updatedAt: now }).where(eq(pushLog.id, item.pushLogId));
    let result: PushDispatchResult;
    try {
      switch (payload.channel) {
        case "EMAIL":
          result = await sendEmail(database, runtime, payload.input, payload.recipient, item.pushLogId, nextAttemptCount);
          break;
        case "WECHAT":
          result = await sendWechat(database, payload.input, item.pushLogId, nextAttemptCount);
          break;
        case "TELEGRAM":
          result = await sendTelegram(database, payload.input, item.pushLogId, nextAttemptCount);
          break;
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "PUSH_SEND_RETRYABLE";
      const exhausted = nextAttemptCount >= item.maxAttempts;
      const updatedAt = new Date();
      await db.update(pushRetry).set({
        status: exhausted ? "EXHAUSTED" : "PENDING",
        nextAttemptAt: exhausted ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) : new Date(now.getTime() + pushRetryDelayMs(nextAttemptCount)),
        lastError: sanitizeDatabaseLogText(reason),
        updatedAt,
      }).where(and(eq(pushRetry.id, item.id), eq(pushRetry.status, "PROCESSING"), eq(pushRetry.attemptCount, nextAttemptCount)));
      await writeResult(database, item.pushLogId, exhausted ? "EXHAUSTED" : "FAILED", nextAttemptCount, { error: reason });
      if (exhausted) exhaustedCount += 1;
      continue;
    }
    if (result.status === "SUCCESS") {
      await db.delete(pushRetry).where(eq(pushRetry.id, item.id));
      sent += 1;
      continue;
    }

    const reason = result.reason ?? "PUSH_SEND_FAILED";
    if (!isRetryableError(reason)) {
      await db.update(pushRetry).set({ status: "EXHAUSTED", lastError: sanitizeDatabaseLogText(reason), updatedAt: new Date() }).where(eq(pushRetry.id, item.id));
      await writeResult(database, item.pushLogId, "FAILED", nextAttemptCount, { error: reason });
      exhaustedCount += 1;
      continue;
    }
    if (nextAttemptCount >= item.maxAttempts) {
      await db.update(pushRetry).set({ status: "EXHAUSTED", lastError: sanitizeDatabaseLogText(reason), updatedAt: new Date() }).where(eq(pushRetry.id, item.id));
      await writeResult(database, item.pushLogId, "EXHAUSTED", nextAttemptCount, { error: reason });
      exhaustedCount += 1;
      continue;
    }
    const updatedAt = new Date();
    await db.update(pushRetry).set({ status: "PENDING", nextAttemptAt: new Date(now.getTime() + pushRetryDelayMs(nextAttemptCount)), lastError: sanitizeDatabaseLogText(reason), updatedAt }).where(eq(pushRetry.id, item.id));
    await db.update(pushLog).set({ status: "PENDING", attemptCount: nextAttemptCount, error: sanitizeDatabaseLogText(reason), updatedAt }).where(eq(pushLog.id, item.pushLogId));
  }
  return { attempted, sent, exhausted: exhaustedCount };
}

export function deliveryItemsFromSnapshots(snapshots: string[]) {
  const items = snapshots.flatMap((snapshot) => {
    try {
      const parsed = JSON.parse(snapshot) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [snapshot];
    } catch {
      return [snapshot];
    }
  });
  if (!items.length) return "暂无发货内容";
  return items.length === 1 ? items[0]! : items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export function orderQueryUrl(siteUrl: string | null | undefined, orderNo: string, ownerUserId: string | null = null) {
  const base = siteUrl?.trim().replace(/\/+$/, "") ?? "";
  const query = new URLSearchParams({ orderNo });
  const path = ownerUserId ? "/account/order" : "/order";
  return `${base}${path}?${query.toString()}`;
}

export async function orderPushVariables(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [[record], [settings], deliveries] = await Promise.all([
    db.select({ orderNo: order.orderNo, ownerUserId: order.ownerUserId, contactEmail: order.contactValue, productName: order.productNameSnapshot, quantity: order.quantity, amount: order.amount, buyerNote: order.buyerNote }).from(order).where(eq(order.id, orderId)).limit(1),
    db.select({ siteName: siteSetting.siteName, siteUrl: siteSetting.siteUrl, footerText: siteSetting.footerText, supportContact: siteSetting.supportContact }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1),
    db.select({ contentSnapshot: orderDelivery.contentSnapshot }).from(orderDelivery).where(and(eq(orderDelivery.orderId, orderId), eq(orderDelivery.status, "SUCCESS"))),
  ]);
  if (!record) return null;
  return { siteName: settings?.siteName || "CFFK", orderNo: record.orderNo, contactEmail: record.contactEmail || "未提供", productName: record.productName, quantity: record.quantity, amount: new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(record.amount / 100), buyerNote: record.buyerNote || "无", deliveryItems: deliveryItemsFromSnapshots(deliveries.flatMap((item) => item.contentSnapshot ? [item.contentSnapshot] : [])), queryUrl: orderQueryUrl(settings?.siteUrl, record.orderNo, record.ownerUserId), footerText: settings?.footerText || "", supportContact: settings?.supportContact || "" };
}
