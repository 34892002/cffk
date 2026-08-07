import { and, eq, lte } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { emailLog, emailProvider, emailRetry, emailTemplate, pushConfig, pushLog } from "@/database/drizzle/schema";
import { parseEmailProviderConfig, parseEmailTemplateConfig, type EmailProviderConfig } from "@/lib/config-schemas";
import { emailRetryDelayMs, renderEmailTemplate } from "@/lib/email-utils";

export type EmailScene = "TEST" | "ORDER_PAID" | "DELIVERY_SUCCESS" | "DELIVERY_FAILED";
export type PushChannel = "EMAIL" | "WECOM" | "TELEGRAM";

type EmailRuntime = Record<string, unknown>;

type CloudflareEmailSender = {
  send(message: { from: string; to: string; subject: string; text?: string; html?: string }): Promise<{ messageId: string }>;
};

export type EmailSendInput = {
  scene: EmailScene;
  to: string;
  variables: Record<string, string | number>;
  orderId?: number;
  triggeredBy?: string;
  recipientType?: "CUSTOMER" | "ADMIN";
};

export class EmailDeliveryError extends Error {}

async function getTemplate(database: D1Database, scene: EmailScene) {
  const [record] = await createDrizzleDb(database)
    .select({ name: emailTemplate.name, templateJson: emailTemplate.templateJson })
    .from(emailTemplate)
    .where(and(eq(emailTemplate.scene, scene), eq(emailTemplate.isEnabled, true)))
    .limit(1);
  if (!record) throw new EmailDeliveryError("EMAIL_TEMPLATE_NOT_AVAILABLE");
  try {
    return { name: record.name, config: parseEmailTemplateConfig(record.templateJson) };
  } catch {
    throw new EmailDeliveryError("EMAIL_TEMPLATE_INVALID");
  }
}

async function getProvider(database: D1Database) {
  const [record] = await createDrizzleDb(database)
    .select({ provider: emailProvider.provider, configJson: emailProvider.configJson })
    .from(emailProvider)
    .where(eq(emailProvider.isEnabled, true))
    .limit(1);
  if (!record) throw new EmailDeliveryError("EMAIL_PROVIDER_NOT_AVAILABLE");
  try {
    return { provider: record.provider, configJson: record.configJson, config: parseEmailProviderConfig(record.configJson) };
  } catch {
    throw new EmailDeliveryError("EMAIL_PROVIDER_INVALID");
  }
}

async function writeLog(database: D1Database, input: {
  orderId?: number;
  provider: string;
  scene: EmailScene;
  status: "SUCCESS" | "FAILED";
  toEmail: string;
  subject: string;
  messageId?: string;
  error?: string;
  triggeredBy?: string;
}) {
  const db = createDrizzleDb(database);
  const createdAt = new Date();
  const [record] = await db.insert(emailLog).values({
    orderId: input.orderId ?? null,
    provider: input.provider,
    scene: input.scene,
    status: input.status,
    toEmail: input.toEmail,
    subject: input.subject,
    messageId: input.messageId ?? null,
    error: input.error ?? null,
    triggeredBy: input.triggeredBy ?? null,
    createdAt,
  }).returning({ id: emailLog.id });
  await db.insert(pushLog).values({
    orderId: input.orderId ?? null,
    channel: "EMAIL" satisfies PushChannel,
    provider: input.provider,
    scene: input.scene satisfies EmailScene,
    recipient: input.toEmail,
    subject: input.subject || null,
    status: input.status,
    messageId: input.messageId ?? null,
    error: input.error ?? null,
    triggeredBy: input.triggeredBy ?? null,
    createdAt,
  });
  return record?.id ?? null;
}

async function isEmailPushEnabled(database: D1Database, scene: EmailScene, recipientType: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  if (scene === "TEST") return true;
  const [config] = await createDrizzleDb(database)
    .select()
    .from(pushConfig)
    .where(eq(pushConfig.id, 1))
    .limit(1);
  if (!config) return true;
  if (!config.isEnabled || !config.emailEnabled) return false;
  if (recipientType === "ADMIN") {
    return scene === "ORDER_PAID"
      ? config.adminOrderPaid
      : scene === "DELIVERY_SUCCESS"
        ? config.adminDeliverySuccess
        : config.adminDeliveryFailed;
  }
  return scene === "ORDER_PAID"
    ? config.customerOrderPaid
    : scene === "DELIVERY_SUCCESS"
      ? config.customerDeliverySuccess
      : config.customerDeliveryFailed;
}

async function sendSnapshot(runtime: EmailRuntime, config: EmailProviderConfig, to: string, subject: string, body: string, format: "text" | "html") {
  if (config.kind !== "cloudflare") throw new EmailDeliveryError("EMAIL_PROVIDER_NOT_IMPLEMENTED");
  const sender = runtime[config.binding] as CloudflareEmailSender | undefined;
  if (!sender?.send) throw new EmailDeliveryError("EMAIL_CLOUDFLARE_BINDING_UNAVAILABLE");
  return sender.send({ from: config.from, to, subject, ...(format === "html" ? { html: body } : { text: body }) });
}



async function enqueueRetry(database: D1Database, emailLogId: number, input: { provider: string; providerConfigJson: string; scene: EmailScene; to: string; subject: string; body: string; format: "text" | "html" }) {
  const now = new Date();
  await createDrizzleDb(database).insert(emailRetry).values({
    emailLogId,
    provider: input.provider,
    providerConfigJson: input.providerConfigJson,
    scene: input.scene,
    toEmail: input.to,
    subject: input.subject,
    body: input.body,
    format: input.format,
    status: "PENDING",
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(1)),
    createdAt: now,
    updatedAt: now,
  });
}

export async function sendEmail(database: D1Database, runtime: EmailRuntime, input: EmailSendInput) {
  if (!(await isEmailPushEnabled(database, input.scene, input.recipientType))) return { messageId: "PUSH_DISABLED" };
  const to = input.to.trim();
  let providerName = "UNAVAILABLE";
  let providerConfigJson: string | null = null;
  let subject = "";
  let body = "";
  let format: "text" | "html" = "text";
  try {
    if (!/^\S+@\S+\.\S+$/.test(to)) throw new EmailDeliveryError("EMAIL_RECIPIENT_INVALID");
    const [template, provider] = await Promise.all([getTemplate(database, input.scene), getProvider(database)]);
    providerName = provider.provider;
    providerConfigJson = provider.configJson;
    subject = renderEmailTemplate(template.config.subject, input.variables);
    body = renderEmailTemplate(template.config.body, input.variables);
    format = template.config.format;

    const messageId = await sendSnapshot(runtime, provider.config, to, subject, body, format);
    await writeLog(database, {
      orderId: input.orderId,
      provider: providerName,
      scene: input.scene,
      status: "SUCCESS",
      toEmail: to,
      subject,
      messageId: messageId.messageId,
      triggeredBy: input.triggeredBy,
    });
    return { messageId: messageId.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "EMAIL_SEND_FAILED";
    const emailLogId = await writeLog(database, {
      orderId: input.orderId,
      provider: providerName,
      scene: input.scene,
      status: "FAILED",
      toEmail: to,
      subject,
      error: message,
      triggeredBy: input.triggeredBy,
    });
    if (emailLogId !== null && providerConfigJson && subject && body) {
      await enqueueRetry(database, emailLogId, { provider: providerName, providerConfigJson, scene: input.scene, to, subject, body, format }).catch(() => undefined);
    }
    throw error;
  }
}

export function toEmailScene(scene: string): EmailScene {
  if (scene === "TEST" || scene === "ORDER_PAID" || scene === "DELIVERY_SUCCESS" || scene === "DELIVERY_FAILED") return scene;
  throw new EmailDeliveryError("EMAIL_SCENE_INVALID");
}

export async function retryDueEmails(database: D1Database, runtime: EmailRuntime, now = new Date(), limit = 50) {
  const db = createDrizzleDb(database);
  const pending = await db
    .select()
    .from(emailRetry)
    .where(and(eq(emailRetry.status, "PENDING"), lte(emailRetry.nextAttemptAt, now)))
    .limit(Math.min(100, Math.max(1, limit)));
  let attempted = 0;
  let sent = 0;

  for (const item of pending) {
    const [originalLog] = await db.select({ orderId: emailLog.orderId }).from(emailLog).where(eq(emailLog.id, item.emailLogId)).limit(1);
    const nextAttemptCount = item.attemptCount + 1;
    const [claimed] = await db
      .update(emailRetry)
      .set({ attemptCount: nextAttemptCount, nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(nextAttemptCount)), updatedAt: now })
      .where(and(eq(emailRetry.id, item.id), eq(emailRetry.status, "PENDING"), eq(emailRetry.attemptCount, item.attemptCount)))
      .returning({ id: emailRetry.id });
    if (!claimed) continue;
    attempted += 1;

    try {
      const config = parseEmailProviderConfig(item.providerConfigJson);
      const message = await sendSnapshot(runtime, config, item.toEmail, item.subject, item.body, item.format);
      await db.update(emailRetry).set({ status: "SENT", lastError: null, updatedAt: new Date() }).where(eq(emailRetry.id, item.id));
      await writeLog(database, { orderId: originalLog?.orderId ?? undefined, provider: item.provider, scene: toEmailScene(item.scene), status: "SUCCESS", toEmail: item.toEmail, subject: item.subject, messageId: message.messageId, triggeredBy: "cron" });
      sent += 1;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "EMAIL_SEND_FAILED";
      const status = nextAttemptCount >= item.maxAttempts ? "EXHAUSTED" as const : "PENDING" as const;
      await db.update(emailRetry).set({ status, lastError: error, updatedAt: new Date() }).where(eq(emailRetry.id, item.id));
      await writeLog(database, { orderId: originalLog?.orderId ?? undefined, provider: item.provider, scene: toEmailScene(item.scene), status: "FAILED", toEmail: item.toEmail, subject: item.subject, error, triggeredBy: "cron" });
    }
  }

  return { attempted, sent };
}
