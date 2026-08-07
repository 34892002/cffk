import { asc, count, eq } from "drizzle-orm";

import { requireAdmin } from "@/server/telefunc-context";
import { emailLog, emailProvider, emailTemplate } from "@/database/drizzle/schema";
import { parseEmailProviderConfig, parseEmailTemplateConfig } from "@/lib/config-schemas";
import { sendEmail, type EmailScene } from "./service";

type EmailProviderKind = "API" | "SMTP" | "CLOUDFLARE";


function getAdminContext() {
  const { database, runtime, db, adminUserId } = requireAdmin();
  return { database, runtime, db, adminUserId };
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_REQUIRED`);
  return normalized;
}


export async function onGetEmailProviders() {
  const { db } = getAdminContext();
  return db
    .select({ id: emailProvider.id, provider: emailProvider.provider, name: emailProvider.name, isEnabled: emailProvider.isEnabled, configJson: emailProvider.configJson, updatedAt: emailProvider.updatedAt })
    .from(emailProvider)
    .orderBy(asc(emailProvider.id));
}

export async function onSaveEmailProvider(input: { provider: EmailProviderKind; name: string; isEnabled: boolean; configJson: string }) {
  const { db } = getAdminContext();
  const name = requiredText(input.name, "EMAIL_PROVIDER_NAME");
  const config = parseEmailProviderConfig(input.configJson);
  const expectedKind = input.provider.toLowerCase();
  if (config.kind !== expectedKind) throw new Error("EMAIL_PROVIDER_KIND_MISMATCH");

  const now = new Date();
  const result = await db
    .update(emailProvider)
    .set({ name, isEnabled: input.isEnabled, configJson: input.configJson, updatedAt: now })
    .where(eq(emailProvider.provider, input.provider))
    .returning({ id: emailProvider.id, provider: emailProvider.provider });
  if (!result[0]) throw new Error("EMAIL_PROVIDER_NOT_FOUND");
  return result[0];
}

export async function onGetEmailTemplates() {
  const { db } = getAdminContext();
  return db
    .select({ id: emailTemplate.id, scene: emailTemplate.scene, name: emailTemplate.name, isEnabled: emailTemplate.isEnabled, templateJson: emailTemplate.templateJson, updatedAt: emailTemplate.updatedAt })
    .from(emailTemplate)
    .orderBy(asc(emailTemplate.id));
}

export async function onSaveEmailTemplate(input: { scene: EmailScene; name: string; isEnabled: boolean; templateJson: string }) {
  const { db } = getAdminContext();
  const name = requiredText(input.name, "EMAIL_TEMPLATE_NAME");
  parseEmailTemplateConfig(input.templateJson);
  const now = new Date();
  const result = await db
    .update(emailTemplate)
    .set({ name, isEnabled: input.isEnabled, templateJson: input.templateJson, updatedAt: now })
    .where(eq(emailTemplate.scene, input.scene))
    .returning({ id: emailTemplate.id, scene: emailTemplate.scene });
  if (!result[0]) throw new Error("EMAIL_TEMPLATE_NOT_FOUND");
  return result[0];
}

export async function onSendTestEmail(input: { to: string; customContent?: string }) {
  const { database, runtime, adminUserId } = getAdminContext();
  return sendEmail(database, runtime, {
    scene: "TEST",
    to: input.to,
    triggeredBy: adminUserId,
    variables: {
      siteName: "CFFK",
      sentAt: new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date()),
      customContent: input.customContent?.trim() || "这是一封测试邮件。",
    },
  });
}

export async function onGetEmailOverview() {
  const { db } = getAdminContext();
  const [total, success, failed, test] = await Promise.all([
    db.select({ value: count() }).from(emailLog),
    db.select({ value: count() }).from(emailLog).where(eq(emailLog.status, "SUCCESS")),
    db.select({ value: count() }).from(emailLog).where(eq(emailLog.status, "FAILED")),
    db.select({ value: count() }).from(emailLog).where(eq(emailLog.scene, "TEST")),
  ]);

  return {
    total: total[0]?.value ?? 0,
    success: success[0]?.value ?? 0,
    failed: failed[0]?.value ?? 0,
    test: test[0]?.value ?? 0,
  };
}

