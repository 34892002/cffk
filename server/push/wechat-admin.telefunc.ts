import { and, asc, eq, ne } from "drizzle-orm";
import { pushChannelConfig } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { formatDateInTimezone } from "@/lib/site-timezone";
import { telefuncAction } from "@/server/telefunc-action";
import { sendWechat } from "@/server/push/service";
import { getSiteSettings } from "@/server/site/public-settings";
import { requireAdmin } from "@/server/telefunc-context";
import { formatThirdPartyProviderConfig, parseThirdPartyProviderConfig, serverChanExample } from "./third-party-provider";

function requiredName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) appError("THIRD_PARTY_NAME_INVALID");
  return value.trim();
}

function parseConfig(value: unknown) {
  if (typeof value !== "string" || value.length > 20_000) appError("THIRD_PARTY_CONFIG_INVALID");
  try { return parseThirdPartyProviderConfig(value); } catch { appError("THIRD_PARTY_CONFIG_INVALID"); }
}

async function getThirdPartyProviders() {
  const { db } = requireAdmin();
  const records = await db.select({ id: pushChannelConfig.id, provider: pushChannelConfig.provider, name: pushChannelConfig.name, isEnabled: pushChannelConfig.isEnabled, configJson: pushChannelConfig.configJson, updatedAt: pushChannelConfig.updatedAt })
    .from(pushChannelConfig).where(eq(pushChannelConfig.channel, "WECHAT")).orderBy(asc(pushChannelConfig.id));
  return {
    example: serverChanExample,
    providers: records.map((record) => {
      try {
        return { ...record, configJson: formatThirdPartyProviderConfig(parseThirdPartyProviderConfig(record.configJson)), configurationError: false };
      } catch {
        return { ...record, configurationError: true };
      }
    }),
  };
}

async function saveThirdPartyProvider(input: { id?: number; name: string; configJson: string; isEnabled: boolean }) {
  const { db } = requireAdmin();
  if (!input || typeof input.isEnabled !== "boolean") appError("THIRD_PARTY_CONFIG_INVALID");
  const name = requiredName(input.name);
  const config = parseConfig(input.configJson);
  const configJson = formatThirdPartyProviderConfig(config);
  if (input.id) {
    const [existing] = await db.select({ id: pushChannelConfig.id }).from(pushChannelConfig).where(and(eq(pushChannelConfig.id, input.id), eq(pushChannelConfig.channel, "WECHAT"))).limit(1);
    if (!existing) appError("THIRD_PARTY_NOT_FOUND");
  }
  const now = new Date();
  if (input.isEnabled) await db.update(pushChannelConfig).set({ isEnabled: false, updatedAt: now }).where(and(eq(pushChannelConfig.channel, "WECHAT"), ne(pushChannelConfig.id, input.id ?? -1)));
  if (input.id) {
    await db.update(pushChannelConfig).set({ provider: "HTTP_JSON", name, isEnabled: input.isEnabled, configJson, updatedAt: now }).where(and(eq(pushChannelConfig.id, input.id), eq(pushChannelConfig.channel, "WECHAT")));
    return { id: input.id };
  }
  const [created] = await db.insert(pushChannelConfig).values({ channel: "WECHAT", provider: "HTTP_JSON", name, isEnabled: input.isEnabled, configJson, createdAt: now, updatedAt: now }).returning({ id: pushChannelConfig.id });
  return created;
}

async function setThirdPartyProviderEnabled(id: number, isEnabled: boolean) {
  const { db } = requireAdmin();
  if (!Number.isInteger(id) || id < 1 || typeof isEnabled !== "boolean") appError("THIRD_PARTY_NOT_FOUND");
  const [record] = await db.select({ configJson: pushChannelConfig.configJson }).from(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "WECHAT"))).limit(1);
  if (!record) appError("THIRD_PARTY_NOT_FOUND");
  try { parseThirdPartyProviderConfig(record.configJson); } catch { appError("THIRD_PARTY_CONFIG_INVALID"); }
  const now = new Date();
  if (isEnabled) await db.update(pushChannelConfig).set({ isEnabled: false, updatedAt: now }).where(and(eq(pushChannelConfig.channel, "WECHAT"), ne(pushChannelConfig.id, id)));
  await db.update(pushChannelConfig).set({ isEnabled, updatedAt: now }).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "WECHAT")));
  return { id, isEnabled };
}

async function deleteThirdPartyProvider(id: number) {
  const { db } = requireAdmin();
  const [deleted] = await db.delete(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "WECHAT"), eq(pushChannelConfig.isEnabled, false))).returning({ id: pushChannelConfig.id });
  if (!deleted) appError("THIRD_PARTY_DELETE_REJECTED");
  return deleted;
}

async function testThirdPartyProvider(id: number) {
  const { db, database, adminUserId } = requireAdmin();
  const [record] = await db.select({ id: pushChannelConfig.id }).from(pushChannelConfig).where(and(eq(pushChannelConfig.id, id), eq(pushChannelConfig.channel, "WECHAT"))).limit(1);
  if (!record) appError("THIRD_PARTY_NOT_FOUND");
  const settings = await getSiteSettings(database);
  const result = await sendWechat(database, {
    scene: "TEST",
    messageType: "ADMIN",
    source: `admin:test:${adminUserId}:${crypto.randomUUID()}`,
    providerConfigId: record.id,
    variables: {
      siteName: settings.siteName,
      sentAt: formatDateInTimezone(new Date(), settings.timezone, { dateStyle: "medium", timeStyle: "medium" }),
      customContent: "这是一条微信三方渠道测试消息。",
    },
  });
  if (result.status !== "SUCCESS") appError(result.reason === "THIRD_PARTY_SEND_RETRYABLE" ? result.reason : "THIRD_PARTY_SEND_FAILED");
  return { messageId: result.messageId };
}

export const onGetThirdPartyProviders = telefuncAction(getThirdPartyProviders);
export const onSaveThirdPartyProvider = telefuncAction(saveThirdPartyProvider);
export const onSetThirdPartyProviderEnabled = telefuncAction(setThirdPartyProviderEnabled);
export const onDeleteThirdPartyProvider = telefuncAction(deleteThirdPartyProvider);
export const onTestThirdPartyProvider = telefuncAction(testThirdPartyProvider);
