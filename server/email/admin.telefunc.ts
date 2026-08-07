import { and, asc, count, desc, eq } from "drizzle-orm";
import { getContext } from "telefunc";
import { createDrizzleDb } from "@/database/drizzle";
import { adminOperationLog, emailLog, emailProvider, emailTemplate } from "@/database/drizzle/schema";
import { parseEmailProviderConfig, parseEmailTemplateConfig } from "@/lib/config-schemas";
import { sendEmail, type EmailScene } from "./service";

type EmailProviderKind = "API" | "SMTP" | "CLOUDFLARE";

type TelefuncContext = {
  env?: Record<string, unknown> & { DB?: D1Database };
  user?: { id: string } | null;
  isAdmin?: boolean;
};

function getAdminContext() {
  const context = getContext<TelefuncContext>();
  if (!context.user || !context.isAdmin || !context.env?.DB) throw new Error("ADMIN_ACCESS_REQUIRED");
  return { database: context.env.DB, runtime: context.env, db: createDrizzleDb(context.env.DB), adminUserId: context.user.id };
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_REQUIRED`);
  return normalized;
}

async function writeAuditLog(db: ReturnType<typeof createDrizzleDb>, adminUserId: string, action: string, targetType: string, targetId: string, detail: string) {
  await db.insert(adminOperationLog).values({ adminUserId, action, targetType, targetId, detail, createdAt: new Date() });
}

export async function onGetEmailProviders() {
  const { db } = getAdminContext();
  return db
    .select({ id: emailProvider.id, provider: emailProvider.provider, name: emailProvider.name, isEnabled: emailProvider.isEnabled, configJson: emailProvider.configJson, updatedAt: emailProvider.updatedAt })
    .from(emailProvider)
    .orderBy(asc(emailProvider.id));
}

export async function onSaveEmailProvider(input: { provider: EmailProviderKind; name: string; isEnabled: boolean; configJson: string }) {
  const { db, adminUserId } = getAdminContext();
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
  await writeAuditLog(db, adminUserId, "UPDATE_EMAIL_PROVIDER", "emailProvider", String(result[0].id), `provider=${result[0].provider}; enabled=${input.isEnabled}`);
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
  const { db, adminUserId } = getAdminContext();
  const name = requiredText(input.name, "EMAIL_TEMPLATE_NAME");
  parseEmailTemplateConfig(input.templateJson);
  const now = new Date();
  const result = await db
    .update(emailTemplate)
    .set({ name, isEnabled: input.isEnabled, templateJson: input.templateJson, updatedAt: now })
    .where(eq(emailTemplate.scene, input.scene))
    .returning({ id: emailTemplate.id, scene: emailTemplate.scene });
  if (!result[0]) throw new Error("EMAIL_TEMPLATE_NOT_FOUND");
  await writeAuditLog(db, adminUserId, "UPDATE_EMAIL_TEMPLATE", "emailTemplate", String(result[0].id), `scene=${result[0].scene}; enabled=${input.isEnabled}`);
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

export async function onGetEmailLogs(input?: { page?: number; pageSize?: number; status?: "SUCCESS" | "FAILED" }) {
  const { db } = getAdminContext();
  const pageSize = Math.min(100, Math.max(10, Math.floor(input?.pageSize ?? 20)));
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const conditions = input?.status ? [eq(emailLog.status, input.status)] : [];
  const where = conditions.length ? and(...conditions) : undefined;
  const [logs, total] = await Promise.all([
    db
      .select({
        id: emailLog.id,
        provider: emailLog.provider,
        scene: emailLog.scene,
        status: emailLog.status,
        toEmail: emailLog.toEmail,
        subject: emailLog.subject,
        messageId: emailLog.messageId,
        error: emailLog.error,
        triggeredBy: emailLog.triggeredBy,
        createdAt: emailLog.createdAt,
      })
      .from(emailLog)
      .where(where)
      .orderBy(desc(emailLog.createdAt), desc(emailLog.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(emailLog).where(where),
  ]);
  return { logs, total: total[0]?.value ?? 0, page, pageSize };
}
