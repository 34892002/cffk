import { telefuncAction } from "@/server/telefunc-action";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { emailTemplate, pushChannelConfig, pushLog } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { isJsonFormEmail } from "@/lib/json-form-values";
import { formatDateInTimezone } from "@/lib/site-timezone";
import { parseEmailTemplateConfig } from "@/lib/config-schemas";
import { getEmailTemplateDefinition } from "@/server/email/template-definitions";
import { dispatchPush } from "@/server/push/service";
import { getSiteSettings } from "@/server/site/public-settings";
import {
  emailProviderDefinitions,
  emailProviderFormValues,
  recoverEmailProviderFormValues,
  serializeEmailProviderConfig,
  type SaveEmailProviderInput,
} from "@/server/push/provider-definitions";
import { requireAdmin } from "@/server/telefunc-context";
import type { PushDispatchResult, PushScene } from "@/server/push/types";

function getAdminContext() {
  const { database, runtime, db, adminUserId } = requireAdmin();
  return { database, runtime, db, adminUserId };
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string") appError(`${field}_REQUIRED`);
  const normalized = value.trim();
  if (!normalized) appError(`${field}_REQUIRED`);
  return normalized;
}


async function internalOnGetEmailProviderDefinitions() {
  getAdminContext();
  return emailProviderDefinitions;
}

async function internalOnGetEmailProviders() {
  const { db } = getAdminContext();
  const records = await db
    .select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, name: pushChannelConfig.name, isEnabled: pushChannelConfig.isEnabled, configJson: pushChannelConfig.configJson, updatedAt: pushChannelConfig.updatedAt })
    .from(pushChannelConfig)
    .where(eq(pushChannelConfig.channel, "EMAIL"))
    .orderBy(asc(pushChannelConfig.id));
  return records.map((record) => {
    if (record.provider !== "API" && record.provider !== "SMTP" && record.provider !== "CLOUDFLARE") {
      return { id: record.id, provider: record.provider, name: record.name, isEnabled: record.isEnabled, updatedAt: record.updatedAt, values: {}, configuredSecrets: [], configurationError: true };
    }
    try {
      const { values, configuredSecrets } = emailProviderFormValues(record.provider, record.configJson);
      return { id: record.id, provider: record.provider, name: record.name, isEnabled: record.isEnabled, updatedAt: record.updatedAt, values, configuredSecrets, configurationError: false };
    } catch {
      const { values, configuredSecrets } = recoverEmailProviderFormValues(record.provider, record.configJson);
      return { id: record.id, provider: record.provider, name: record.name, isEnabled: record.isEnabled, updatedAt: record.updatedAt, values, configuredSecrets, configurationError: true };
    }
  });
}

async function saveEmailProvider(input: SaveEmailProviderInput) {
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

async function deleteEmailProvider(id: number) {
  const { db } = getAdminContext();
  const result = await db.delete(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "EMAIL"), eq(pushChannelConfig.isEnabled, false))).returning({ id: pushChannelConfig.id });
  if (!result[0]) appError("EMAIL_PROVIDER_DELETE_REJECTED");
  return result[0];
}

async function setEmailProviderEnabled(id: number, isEnabled: boolean) {
  const { db } = getAdminContext();
  const [target] = await db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "EMAIL"))).limit(1);
  if (!target) appError("EMAIL_PROVIDER_NOT_FOUND");
  if (isEnabled) {
    if (target.provider !== "API" && target.provider !== "SMTP" && target.provider !== "CLOUDFLARE") appError("EMAIL_PROVIDER_INVALID");
    try { emailProviderFormValues(target.provider, target.configJson); } catch { appError("EMAIL_PROVIDER_INVALID"); }
  }

  const now = new Date();
  if (isEnabled) await db.update(pushChannelConfig).set({ isEnabled: false, updatedAt: now }).where(and(eq(pushChannelConfig.channel, "EMAIL"), ne(pushChannelConfig.id, id)));
  const result = await db.update(pushChannelConfig).set({ isEnabled, updatedAt: now }).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "EMAIL"))).returning({ id: pushChannelConfig.id, provider: pushChannelConfig.provider });
  return result[0];
}

async function internalOnGetEmailTemplates() {
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

async function saveEmailTemplate(input: { scene: PushScene; name: string; subject: string; body: string; format: "text" | "html" }) {
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
  if (!result[0]) appError("EMAIL_TEMPLATE_NOT_FOUND");
  return result[0];
}

const testDeliveryErrorCodes = new Set([
  "EMAIL_SMTP_HOST_INVALID",
  "EMAIL_SEND_RETRYABLE",
  "EMAIL_CLOUDFLARE_BINDING_UNAVAILABLE",
  "EMAIL_CLOUDFLARE_SENDER_NOT_VERIFIED",
  "EMAIL_CLOUDFLARE_SENDER_DOMAIN_UNAVAILABLE",
  "EMAIL_CLOUDFLARE_RECIPIENT_NOT_ALLOWED",
  "EMAIL_CLOUDFLARE_RECIPIENT_SUPPRESSED",
  "EMAIL_CLOUDFLARE_CONTENT_TOO_LARGE",
  "EMAIL_CLOUDFLARE_INVALID",
  "EMAIL_CLOUDFLARE_RATE_LIMITED",
  "EMAIL_CLOUDFLARE_FAILED",
]);

function testDeliveryError(result: PushDispatchResult) {
  if (result.status === "SUCCESS") return;
  if (result.reason === "EMAIL_TEMPLATE_NOT_AVAILABLE" || result.reason === "CHANNEL_NOT_AVAILABLE") appError(result.reason === "CHANNEL_NOT_AVAILABLE" ? "EMAIL_PROVIDER_NOT_AVAILABLE" : result.reason);
  if (result.reason && testDeliveryErrorCodes.has(result.reason)) appError(result.reason);
  appError("EMAIL_SEND_FAILED");
}

async function sendTestEmail(input: { to: string; customContent?: string; providerConfigId?: number }) {
  const { database, runtime, adminUserId } = getAdminContext();
  const recipient = input.to.trim();
  if (!isJsonFormEmail(recipient)) appError("EMAIL_RECIPIENT_INVALID");

  const settings = await getSiteSettings(database);
  const results = await dispatchPush(database, runtime, { scene: "TEST", messageType: "ADMIN", recipient: { type: "ADMIN", address: recipient }, source: `admin:test:${adminUserId}:${crypto.randomUUID()}`, providerConfigId: input.providerConfigId, variables: { siteName: settings.siteName, sentAt: formatDateInTimezone(new Date(), settings.timezone, { dateStyle: "medium", timeStyle: "medium" }), customContent: input.customContent?.trim() || "这是一封测试邮件。" } });
  const result = results[0];
  if (!result) appError("EMAIL_SEND_FAILED");
  testDeliveryError(result);
  return { messageId: result.messageId };
}


async function internalOnGetEmailOverview() {
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

export const onGetEmailProviderDefinitions = telefuncAction(internalOnGetEmailProviderDefinitions);
export const onGetEmailProviders = telefuncAction(internalOnGetEmailProviders);
export const onSaveEmailProvider = telefuncAction(saveEmailProvider);
export const onDeleteEmailProvider = telefuncAction(deleteEmailProvider);
export const onSetEmailProviderEnabled = telefuncAction(setEmailProviderEnabled);
export const onGetEmailTemplates = telefuncAction(internalOnGetEmailTemplates);
export const onSaveEmailTemplate = telefuncAction(saveEmailTemplate);
export const onSendTestEmail = telefuncAction(sendTestEmail);
export const onGetEmailOverview = telefuncAction(internalOnGetEmailOverview);
