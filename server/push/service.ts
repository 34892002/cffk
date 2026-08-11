import { and, eq, lte, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { adminBootstrap, emailTemplate, order, orderDelivery, pushChannelConfig, pushConfig, pushLog, pushPolicy, pushRetry, siteSetting, user } from "@/database/drizzle/schema";
import { parseEmailTemplateConfig } from "@/lib/config-schemas";
import { parseEmailProviderConfigForKind, type EmailProviderKind } from "@/server/push/provider-definitions";
import { parseEmailApiSuccessResponse, pushRetryDelayMs, renderPushTemplate } from "@/lib/push-utils";
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

function isEmail(value: string | null | undefined) {
  return /^\S+@\S+\.\S+$/.test(value?.trim() ?? "");
}

function hasEmailChannel(channelsJson: string) {
  try { return Array.isArray(JSON.parse(channelsJson)) && (JSON.parse(channelsJson) as unknown[]).includes("EMAIL"); } catch { return false; }
}

async function policyEnabled(database: D1Database, input: PushDispatchInput) {
  if (input.scene === "TEST") return true;
  const db = createDrizzleDb(database);
  const [[config], [policy]] = await Promise.all([
    db.select({ isEnabled: pushConfig.isEnabled }).from(pushConfig).where(eq(pushConfig.id, 1)).limit(1),
    db.select({ isEnabled: pushPolicy.isEnabled, channelsJson: pushPolicy.channelsJson }).from(pushPolicy).where(and(eq(pushPolicy.messageType, input.messageType), eq(pushPolicy.scene, input.scene))).limit(1),
  ]);
  return Boolean(config?.isEnabled && policy?.isEnabled && hasEmailChannel(policy.channelsJson));
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

function idempotencyKey(input: PushDispatchInput, recipient: string) {
  return `${input.source}:${input.orderId ?? "test"}:${input.messageType}:${input.scene}:EMAIL:${recipient}`;
}

async function createTask(database: D1Database, input: PushDispatchInput, recipient: string) {
  const now = new Date();
  const key = idempotencyKey(input, recipient);
  const result = await createDrizzleDb(database).insert(pushLog).values({
    orderId: input.orderId ?? null,
    idempotencyKey: key,
    messageType: input.messageType,
    channel: "EMAIL",
    provider: "UNAVAILABLE",
    scene: input.scene,
    recipient,
    status: "PENDING",
    triggeredBy: input.source,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning({ id: pushLog.id });
  return result[0]?.id ?? null;
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
  return reason === "EMAIL_SEND_RETRYABLE" || reason === "EMAIL_CLOUDFLARE_RATE_LIMITED" || reason === "EMAIL_CLOUDFLARE_FAILED" || /network|timeout|temporar/i.test(reason);
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

type RetryPayload = { input: PushDispatchInput; recipient: string };

function parseRetryPayload(value: string): RetryPayload | null {
  try {
    const payload = JSON.parse(value) as Partial<RetryPayload>;
    if (!payload.input || typeof payload.recipient !== "string") return null;
    return payload as RetryPayload;
  } catch {
    return null;
  }
}

async function sendEmail(database: D1Database, runtime: Runtime, input: PushDispatchInput, recipient: string, existingTaskId?: number, attemptCount = 1): Promise<PushDispatchResult> {
  const taskId = existingTaskId ?? await createTask(database, input, recipient);
  if (taskId === null) return { channel: "EMAIL", recipient, status: "SKIPPED", reason: "DUPLICATE_EVENT" };
  const db = createDrizzleDb(database);
  const [[providerRecord], [templateRecord]] = await Promise.all([
    db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(input.providerConfigId ? and(eq(pushChannelConfig.id, input.providerConfigId), eq(pushChannelConfig.channel, "EMAIL")) : and(eq(pushChannelConfig.channel, "EMAIL"), eq(pushChannelConfig.isEnabled, true))).limit(1),
    db.select({ templateJson: emailTemplate.templateJson }).from(emailTemplate).where(eq(emailTemplate.scene, input.scene)).limit(1),
  ]);
  if (!providerRecord || !templateRecord) {
    const reason = !providerRecord ? "CHANNEL_NOT_AVAILABLE" : "EMAIL_TEMPLATE_NOT_AVAILABLE";
    await writeResult(database, taskId, "SKIPPED", attemptCount, { error: reason });
    return { channel: "EMAIL", recipient, status: "SKIPPED", reason };
  }
  await db.update(pushLog).set({ channelConfigId: providerRecord.id, provider: providerRecord.provider, updatedAt: new Date() }).where(eq(pushLog.id, taskId));
  try {
    if (providerRecord.provider !== "API" && providerRecord.provider !== "SMTP" && providerRecord.provider !== "CLOUDFLARE") throw new Error("EMAIL_PROVIDER_INVALID");
    const provider = parseEmailProviderConfigForKind(providerRecord.provider as EmailProviderKind, providerRecord.configJson);
    const template = parseEmailTemplateConfig(templateRecord.templateJson);
    const subject = renderPushTemplate(template.subject, input.variables);
    const body = renderPushTemplate(template.body, input.variables);
    let result: { messageId?: string };
    if (provider.kind === "cloudflare") {
      const sender = runtime.EMAIL;
      if (!sender || typeof sender.send !== "function") throw new Error("EMAIL_CLOUDFLARE_BINDING_UNAVAILABLE");
      try {
        result = await sender.send({
          to: recipient,
          from: provider.fromName ? { email: provider.from, name: provider.fromName } : provider.from,
          subject,
          ...(template.format === "html" ? { html: body } : { text: body }),
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
      const response = await postEmailApi(endpoint, headers, JSON.stringify(provider.apiProvider === "RESEND" ? { from, to: [recipient], ...(provider.replyTo ? { reply_to: provider.replyTo } : {}), subject, ...(template.format === "html" ? { html: body } : { text: body }) } : { sender: { email: provider.from, ...(provider.fromName ? { name: provider.fromName } : {}) }, to: [{ email: recipient }], ...(provider.replyTo ? { replyTo: { email: provider.replyTo } } : {}), subject, textContent: body, htmlContent: template.format === "html" ? body : undefined }), provider.timeoutMs ?? DEFAULT_API_TIMEOUT_MS);
      if (!response.ok) throw new Error(response.status === 429 || response.status >= 500 ? "EMAIL_SEND_RETRYABLE" : "EMAIL_SEND_FAILED");
      result = parseEmailApiSuccessResponse(await response.text());
    } else {
      const { WorkerMailer } = await import("worker-mailer");
      const password = provider.password;
      await WorkerMailer.send({ host: provider.host, port: provider.port, secure: provider.secure, credentials: { username: provider.username, password }, authType: provider.authType ?? "plain" }, { from: { email: provider.from, name: provider.fromName }, to: recipient, reply: provider.replyTo, subject, text: body, ...(template.format === "html" ? { html: body } : {}) });
      result = {};
    }
    await writeResult(database, taskId, "SUCCESS", attemptCount, { provider: providerRecord.provider, subject, messageId: result.messageId });
    return { channel: "EMAIL", recipient, status: "SUCCESS", messageId: result.messageId };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "EMAIL_SEND_FAILED";
    await writeResult(database, taskId, "FAILED", attemptCount, { provider: providerRecord.provider, error: reason });
    if (existingTaskId === undefined) {
      const now = new Date();
      const retryable = isRetryableError(reason);
      await createDrizzleDb(database).insert(pushRetry).values({
        pushLogId: taskId,
        payloadJson: JSON.stringify({ input: { ...input, providerConfigId: providerRecord.id }, recipient }),
        status: retryable ? "PENDING" : "EXHAUSTED",
        attemptCount,
        nextAttemptAt: new Date(now.getTime() + pushRetryDelayMs(attemptCount)),
        lastError: sanitizeDatabaseLogText(reason),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      if (retryable) await createDrizzleDb(database).update(pushLog).set({ status: "PENDING", attemptCount, error: sanitizeDatabaseLogText(reason), updatedAt: now }).where(eq(pushLog.id, taskId));
    }
    return { channel: "EMAIL", recipient, status: "FAILED", reason };
  }
}

export async function dispatchPush(database: D1Database, runtime: Runtime, input: PushDispatchInput) {
  const [enabled, targets] = await Promise.all([policyEnabled(database, input), recipients(database, input)]);
  if (!enabled) return [] as PushDispatchResult[];
  if (!targets.length) return [{ channel: "EMAIL" as PushChannel, recipient: "", status: "SKIPPED" as const, reason: "RECIPIENT_NOT_CONFIGURED" }];
  return Promise.all(targets.map((target) => sendEmail(database, runtime, input, target.address)));
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
      result = await sendEmail(database, runtime, payload.input, payload.recipient, item.pushLogId, nextAttemptCount);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "EMAIL_SEND_RETRYABLE";
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

    const reason = result.reason ?? "EMAIL_SEND_FAILED";
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

export function orderQueryUrl(siteUrl: string | null | undefined, orderNo: string, queryToken: string) {
  const base = siteUrl?.trim().replace(/\/+$/, "") ?? "";
  const query = new URLSearchParams({ orderNo, token: queryToken });
  return `${base}/order?${query.toString()}`;
}

export async function orderPushVariables(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [[record], [settings], deliveries] = await Promise.all([
    db.select({ orderNo: order.orderNo, queryToken: order.queryToken, contactEmail: order.contactValue, productName: order.productNameSnapshot, quantity: order.quantity, amount: order.amount, buyerNote: order.buyerNote }).from(order).where(eq(order.id, orderId)).limit(1),
    db.select({ siteName: siteSetting.siteName, siteUrl: siteSetting.siteUrl, footerText: siteSetting.footerText, supportContact: siteSetting.supportContact }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1),
    db.select({ contentSnapshot: orderDelivery.contentSnapshot }).from(orderDelivery).where(and(eq(orderDelivery.orderId, orderId), eq(orderDelivery.status, "SUCCESS"))),
  ]);
  if (!record) return null;
  return { siteName: settings?.siteName || "CFFK", orderNo: record.orderNo, contactEmail: record.contactEmail || "未提供", productName: record.productName, quantity: record.quantity, amount: new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(record.amount / 100), buyerNote: record.buyerNote || "无", deliveryItems: deliveryItemsFromSnapshots(deliveries.flatMap((item) => item.contentSnapshot ? [item.contentSnapshot] : [])), queryUrl: orderQueryUrl(settings?.siteUrl, record.orderNo, record.queryToken), footerText: settings?.footerText || "", supportContact: settings?.supportContact || "" };
}
