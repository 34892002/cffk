import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { emailTemplate, pushChannelConfig, pushLog } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { parseEmailTemplateConfig } from "@/lib/config-schemas";
import { getEmailTemplateDefinition } from "@/server/email/template-definitions";
import { dispatchPush } from "@/server/push/service";
import {
  emailProviderDefinitions,
  maskedEmailProviderConfig,
  serializeEmailProviderConfig,
  type SaveEmailProviderInput,
} from "@/server/push/provider-definitions";
import { requireAdmin } from "@/server/telefunc-context";
import type { PushDispatchResult, PushScene } from "@/server/push/types";

function getAdminContext() {
  const { database, runtime, db, adminUserId } = requireAdmin();
  return { database, runtime, db, adminUserId };
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_REQUIRED`);
  return normalized;
}

export async function onGetEmailProviderDefinitions() {
  getAdminContext();
  return emailProviderDefinitions;
}

export async function onGetEmailProviders() {
  const { db } = getAdminContext();
  const records = await db
    .select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, name: pushChannelConfig.name, isEnabled: pushChannelConfig.isEnabled, configJson: pushChannelConfig.configJson, updatedAt: pushChannelConfig.updatedAt })
    .from(pushChannelConfig)
    .where(eq(pushChannelConfig.channel, "EMAIL"))
    .orderBy(asc(pushChannelConfig.id));
  return records.map((record) => {
    if (record.provider !== "API" && record.provider !== "SMTP" && record.provider !== "CLOUDFLARE") {
      return { id: record.id, provider: record.provider, name: record.name, isEnabled: record.isEnabled, updatedAt: record.updatedAt, values: {}, secrets: {}, configurationError: true };
    }
    try {
      const { values, secrets } = maskedEmailProviderConfig(record.provider, record.configJson);
      return { id: record.id, provider: record.provider, name: record.name, isEnabled: record.isEnabled, updatedAt: record.updatedAt, values, secrets, configurationError: false };
    } catch {
      return { id: record.id, provider: record.provider, name: record.name, isEnabled: record.isEnabled, updatedAt: record.updatedAt, values: {}, secrets: {}, configurationError: true };
    }
  });
}

export async function onSaveEmailProvider(input: SaveEmailProviderInput) {
  const { db } = getAdminContext();
  if (!input || input.channel !== "EMAIL" || (input.provider !== "API" && input.provider !== "SMTP" && input.provider !== "CLOUDFLARE") || typeof input.isEnabled !== "boolean" || !input.values) appError("EMAIL_PROVIDER_INVALID");

  const name = requiredText(input.name, "EMAIL_PROVIDER_NAME");
  const existing = input.id
    ? await db.select({ id: pushChannelConfig.id, channel: pushChannelConfig.channel, configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(eq(pushChannelConfig.id, input.id)).limit(1)
    : [];
  if (input.id && (!existing[0] || existing[0].channel !== "EMAIL")) appError("EMAIL_PROVIDER_NOT_FOUND");
  let configJson: string;
  try {
    configJson = serializeEmailProviderConfig(input, existing[0]?.configJson);
  } catch {
    appError("EMAIL_PROVIDER_INVALID");
  }
  const now = new Date();
  if (input.isEnabled) await db.update(pushChannelConfig).set({ isEnabled: false, updatedAt: now }).where(and(eq(pushChannelConfig.channel, "EMAIL"), ne(pushChannelConfig.id, input.id ?? -1)));
  if (input.id) {
    const result = await db.update(pushChannelConfig).set({ provider: input.provider, name, isEnabled: input.isEnabled, configJson, updatedAt: now }).where(and(eq(pushChannelConfig.id, input.id), eq(pushChannelConfig.channel, "EMAIL"))).returning({ id: pushChannelConfig.id, provider: pushChannelConfig.provider });
    if (!result[0]) appError("EMAIL_PROVIDER_NOT_FOUND");
    return result[0];
  }
  const result = await db.insert(pushChannelConfig).values({ channel: "EMAIL", provider: input.provider, name, isEnabled: input.isEnabled, configJson, createdAt: now, updatedAt: now }).returning({ id: pushChannelConfig.id, provider: pushChannelConfig.provider });
  return result[0];
}

export async function onDeleteEmailProvider(id: number) {
  const { db } = getAdminContext();
  const result = await db.delete(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "EMAIL"), eq(pushChannelConfig.isEnabled, false))).returning({ id: pushChannelConfig.id });
  if (!result[0]) appError("EMAIL_PROVIDER_DELETE_REJECTED");
  return result[0];
}

export async function onSetEmailProviderEnabled(id: number, isEnabled: boolean) {
  const { db } = getAdminContext();
  const [target] = await db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider }).from(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "EMAIL"))).limit(1);
  if (!target) appError("EMAIL_PROVIDER_NOT_FOUND");

  const now = new Date();
  if (isEnabled) await db.update(pushChannelConfig).set({ isEnabled: false, updatedAt: now }).where(and(eq(pushChannelConfig.channel, "EMAIL"), ne(pushChannelConfig.id, id)));
  const result = await db.update(pushChannelConfig).set({ isEnabled, updatedAt: now }).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "EMAIL"))).returning({ id: pushChannelConfig.id, provider: pushChannelConfig.provider });
  return result[0];
}

export async function onGetEmailTemplates() {
  const { db } = getAdminContext();
  const records = await db.select({ id: emailTemplate.id, scene: emailTemplate.scene, name: emailTemplate.name, templateJson: emailTemplate.templateJson, updatedAt: emailTemplate.updatedAt }).from(emailTemplate).orderBy(asc(emailTemplate.id));
  return records.map((record) => {
    const definition = getEmailTemplateDefinition(record.scene);
    try {
      const config = parseEmailTemplateConfig(record.templateJson);
      return { id: record.id, scene: record.scene, name: record.name, subject: config.subject, body: config.body, format: config.format, description: definition.description, variables: definition.variables, updatedAt: record.updatedAt };
    } catch {
      return { id: record.id, scene: record.scene, name: record.name, subject: "", body: "", format: "text" as const, description: definition.description, variables: definition.variables, updatedAt: record.updatedAt, configurationError: true };
    }
  });
}

function templateVariables(value: string) {
  return [...value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g)].map((match) => match[1]).filter((key): key is string => Boolean(key));
}

export async function onSaveEmailTemplate(input: { scene: PushScene; name: string; subject: string; body: string; format: "text" | "html" }) {
  const { db } = getAdminContext();
  const name = requiredText(input.name, "EMAIL_TEMPLATE_NAME");
  const definition = getEmailTemplateDefinition(input.scene);
  const subject = input.subject.trim();
  const body = input.body.trim();
  const allowedVariables = new Set(definition.variables.map((variable) => variable.key));
  const variables = [...new Set([...templateVariables(subject), ...templateVariables(body)])];
  if (variables.some((variable) => !allowedVariables.has(variable))) appError("EMAIL_TEMPLATE_VARIABLE_INVALID");
  const templateJson = JSON.stringify({ subject, body, format: input.format, variables });
  try { parseEmailTemplateConfig(templateJson); } catch { appError("EMAIL_TEMPLATE_INVALID"); }
  const result = await db.update(emailTemplate).set({ name, templateJson, updatedAt: new Date() }).where(eq(emailTemplate.scene, input.scene)).returning({ id: emailTemplate.id, scene: emailTemplate.scene });
  if (!result[0]) throw new Error("EMAIL_TEMPLATE_NOT_FOUND");
  return result[0];
}

function testDeliveryError(result: PushDispatchResult) {
  if (result.status === "SUCCESS") return;
  if (result.reason === "EMAIL_TEMPLATE_NOT_AVAILABLE" || result.reason === "CHANNEL_NOT_AVAILABLE") appError(result.reason === "CHANNEL_NOT_AVAILABLE" ? "EMAIL_PROVIDER_NOT_AVAILABLE" : result.reason);
  appError("EMAIL_SEND_FAILED");
}

export async function onSendTestEmail(input: { to: string; customContent?: string; providerConfigId?: number }) {
  const { database, runtime, adminUserId } = getAdminContext();
  const recipient = input.to.trim();
  if (!/^\S+@\S+\.\S+$/.test(recipient)) appError("EMAIL_RECIPIENT_INVALID");

  const results = await dispatchPush(database, runtime, { scene: "TEST", messageType: "ADMIN", recipient: { type: "ADMIN", address: recipient }, source: `admin:test:${adminUserId}:${crypto.randomUUID()}`, providerConfigId: input.providerConfigId, variables: { siteName: "CFFK", sentAt: new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date()), customContent: input.customContent?.trim() || "这是一封测试邮件。" } });
  const result = results[0];
  if (!result) appError("EMAIL_SEND_FAILED");
  testDeliveryError(result);
  return { messageId: result.messageId };
}

export async function onGetEmailOverview() {
  const { db } = getAdminContext();
  const [total, success, failed, skipped, pending, test] = await Promise.all([
    db.select({ value: count() }).from(pushLog).where(eq(pushLog.channel, "EMAIL")),
    db.select({ value: count() }).from(pushLog).where(and(eq(pushLog.channel, "EMAIL"), eq(pushLog.status, "SUCCESS"))),
    db.select({ value: count() }).from(pushLog).where(and(eq(pushLog.channel, "EMAIL"), inArray(pushLog.status, ["FAILED", "EXHAUSTED"]))),
    db.select({ value: count() }).from(pushLog).where(and(eq(pushLog.channel, "EMAIL"), eq(pushLog.status, "SKIPPED"))),
    db.select({ value: count() }).from(pushLog).where(and(eq(pushLog.channel, "EMAIL"), eq(pushLog.status, "PENDING"))),
    db.select({ value: count() }).from(pushLog).where(and(eq(pushLog.channel, "EMAIL"), eq(pushLog.scene, "TEST"))),
  ]);
  return { total: total[0]?.value ?? 0, success: success[0]?.value ?? 0, failed: failed[0]?.value ?? 0, skipped: skipped[0]?.value ?? 0, pending: pending[0]?.value ?? 0, test: test[0]?.value ?? 0 };
}
