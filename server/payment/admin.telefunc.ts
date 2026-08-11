import { telefuncAction } from "@/server/telefunc-action";
import { asc, count, eq } from "drizzle-orm";

import { requireAdmin } from "@/server/telefunc-context";
import { paymentLog, paymentProvider, siteSetting } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { getPaymentNotifyPath, getPaymentUrlDefaults, getProviderDefinition, paymentProviderDefinitions, parseProviderConfig, type PaymentProviderKind } from "./registry";
import { paymentRepository } from "./repository";

type JsonValue = string | number | boolean | string[];
type SecretUpdate = { action: "keepExisting" } | { action: "value"; value: string } | { action: "clear" };
type SecretUpdates = Record<string, SecretUpdate>;

function now() {
  return new Date();
}

export function mergePaymentUrls(provider: PaymentProviderKind, siteUrl: string | null | undefined, values: Record<string, JsonValue>): Record<string, string> {
  const defaults = getPaymentUrlDefaults(provider, siteUrl);
  const hasNotifyUrl = getProviderDefinition(provider)?.fields.some((field) => field.key === "notifyUrl") ?? false;
  if (!defaults.returnUrl || (hasNotifyUrl && !defaults.notifyUrl)) appError("PAYMENT_SITE_URL_REQUIRED");
  const origin = new URL(siteUrl!).origin;
  const returnUrl = typeof values.returnUrl === "string" ? values.returnUrl : defaults.returnUrl;
  const notifyUrl = typeof values.notifyUrl === "string" ? values.notifyUrl : defaults.notifyUrl;
  let parsedReturnUrl: URL;
  try { parsedReturnUrl = new URL(returnUrl); } catch { appError("PAYMENT_RETURN_URL_INVALID"); }
  if (parsedReturnUrl.origin !== origin || parsedReturnUrl.username || parsedReturnUrl.password) appError("PAYMENT_RETURN_URL_INVALID");
  if (hasNotifyUrl) {
    let parsedNotifyUrl: URL;
    try { parsedNotifyUrl = new URL(notifyUrl); } catch { appError("PAYMENT_NOTIFY_URL_INVALID"); }
    const notifyPath = getPaymentNotifyPath(provider);
    if (parsedNotifyUrl.origin !== origin || parsedNotifyUrl.username || parsedNotifyUrl.password || (parsedNotifyUrl.pathname !== notifyPath && !parsedNotifyUrl.pathname.startsWith(`${notifyPath}/`))) appError("PAYMENT_NOTIFY_URL_INVALID");
  }
  const result: Record<string, string> = { returnUrl };
  if (hasNotifyUrl) result.notifyUrl = notifyUrl;
  return result;
}

function maskedSecret(value: unknown) {
  return typeof value === "string" && value.length > 0 ? { configured: true, masked: "••••••••" } : { configured: false, masked: "" };
}

export function mergePaymentProviderConfig(input: {
  provider: PaymentProviderKind;
  currentConfigJson?: string;
  values: Record<string, JsonValue>;
  secretUpdates: SecretUpdates;
}) {
  const definition = getProviderDefinition(input.provider);
  if (!definition) appError("PAYMENT_PROVIDER_NOT_IMPLEMENTED");
  let existing: Record<string, unknown> = {};
  if (input.currentConfigJson) {
    try {
      const parsed: unknown = JSON.parse(input.currentConfigJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed as Record<string, unknown>;
    } catch { /* Invalid stored JSON cannot block a complete replacement. */ }
  }
  const config: Record<string, unknown> = {};
  const allowed = new Set(definition.fields.map((field) => field.key));
  for (const key of Object.keys(input.values ?? {})) if (!allowed.has(key)) appError("PAYMENT_CONFIG_INVALID");
  for (const [key, update] of Object.entries(input.secretUpdates ?? {})) {
    const field = definition.fields.find((item) => item.key === key);
    if (!field?.secret || !update || !["keepExisting", "value", "clear"].includes(update.action)) appError("PAYMENT_CONFIG_INVALID");
    if (update.action === "keepExisting" && existing[key] !== undefined) config[key] = existing[key];
    if (update.action === "value") config[key] = update.value;
  }
  for (const [key, value] of Object.entries(input.values ?? {})) config[key] = value;
  config.schemaVersion = definition.schemaVersion;
  const configJson = JSON.stringify(config);
  try { parseProviderConfig(input.provider, configJson); } catch { appError("PAYMENT_CONFIG_INVALID"); }
  return configJson;
}

function getSafeForm(provider: string, name: string, isEnabled: boolean, sort: number, configJson: string, siteUrl: string | null, updatedAt?: Date) {
  const definition = getProviderDefinition(provider);
  if (!definition) return null;
  let parsed: Record<string, unknown> = {};
  let valid = true;
  try { parsed = definition.parseConfig(configJson) as unknown as Record<string, unknown>; } catch { valid = false; }

  const values: Record<string, JsonValue> = {};
  const secrets: Record<string, ReturnType<typeof maskedSecret>> = {};
  const urlDefaults = getPaymentUrlDefaults(provider as PaymentProviderKind, siteUrl);
  for (const field of definition.fields) {
    const value = field.key === "notifyUrl" ? parsed.notifyUrl || urlDefaults.notifyUrl : field.key === "returnUrl" ? parsed.returnUrl || urlDefaults.returnUrl : parsed[field.key] ?? definition.defaults[field.key];
    if (field.secret) secrets[field.key] = maskedSecret(value);
    else if (value !== undefined) values[field.key] = value as JsonValue;
  }
  return { provider, title: definition.title, name, isEnabled, sort, updatedAt: updatedAt?.toISOString() ?? null, valid, schemaVersion: definition.schemaVersion, fields: definition.fields, values, secrets, siteUrl };
}

async function internalOnGetPaymentProviders() {
  const { db } = requireAdmin();
  const [settings] = await db.select({ siteUrl: siteSetting.siteUrl }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  const records = await db.select().from(paymentProvider).orderBy(asc(paymentProvider.sort), asc(paymentProvider.id));
  const byProvider = new Map(records.map((record) => [record.provider, record]));
  return (Object.keys(paymentProviderDefinitions) as PaymentProviderKind[]).map((provider, index) => {
    const record = byProvider.get(provider);
    return getSafeForm(provider, record?.name ?? paymentProviderDefinitions[provider].title, record?.isEnabled ?? false, record?.sort ?? (index + 1) * 10, record?.configJson ?? JSON.stringify(paymentProviderDefinitions[provider].defaults), settings?.siteUrl ?? null, record?.updatedAt)!;
  });
}

async function internalOnGetPaymentProviderForm(input: { provider: PaymentProviderKind }) {
  const { db } = requireAdmin();
  const [settings] = await db.select({ siteUrl: siteSetting.siteUrl }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  const [record] = await db.select().from(paymentProvider).where(eq(paymentProvider.provider, input.provider)).limit(1);
  return getSafeForm(input.provider, record?.name ?? paymentProviderDefinitions[input.provider].title, record?.isEnabled ?? false, record?.sort ?? 0, record?.configJson ?? JSON.stringify(paymentProviderDefinitions[input.provider].defaults), settings?.siteUrl ?? null, record?.updatedAt);
}

async function savePaymentProvider(input: {
  provider: PaymentProviderKind;
  name: string;
  isEnabled: boolean;
  values: Record<string, JsonValue>;
  secretUpdates: SecretUpdates;
}) {
  const { db } = requireAdmin();
  const definition = getProviderDefinition(input.provider);
  if (!definition) appError("PAYMENT_PROVIDER_NOT_IMPLEMENTED");
  const name = input.name.trim();
  if (!name) appError("PAYMENT_PROVIDER_NAME_REQUIRED");
  const [current, settings] = await Promise.all([
    db.select().from(paymentProvider).where(eq(paymentProvider.provider, input.provider)).limit(1).then(([record]) => record),
    db.select({ siteUrl: siteSetting.siteUrl }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1).then(([record]) => record),
  ]);
  const urls = mergePaymentUrls(input.provider, settings?.siteUrl, input.values);
  const configJson = mergePaymentProviderConfig({ provider: input.provider, currentConfigJson: current?.configJson, values: { ...input.values, ...urls }, secretUpdates: input.secretUpdates });
  const timestamp = now();
  if (current) {
    await db.update(paymentProvider).set({ name, isEnabled: input.isEnabled, configJson, updatedAt: timestamp }).where(eq(paymentProvider.provider, input.provider));
  } else {
    await db.insert(paymentProvider).values({ provider: input.provider, name, isEnabled: input.isEnabled, sort: 0, configJson, createdAt: timestamp, updatedAt: timestamp });
  }
  return { provider: input.provider };
}

async function internalOnGetPaymentLogs(input?: { provider?: PaymentProviderKind; page?: number; pageSize?: number }) {
  const { database, db } = requireAdmin();
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input?.pageSize ?? 20)));
  const provider = input?.provider;
  const rows = await paymentRepository(database).listLogs({ provider, page, pageSize });
  const where = provider ? eq(paymentLog.provider, provider) : undefined;
  const [total] = await db.select({ value: count() }).from(paymentLog).where(where);
  return { rows, total: total?.value ?? 0, page, pageSize };
}

async function validatePaymentProviderConfig(input: {
  provider: PaymentProviderKind;
  values: Record<string, JsonValue>;
  secretUpdates: SecretUpdates;
}) {
  const { db } = requireAdmin();
  const [record, settings] = await Promise.all([
    db.select().from(paymentProvider).where(eq(paymentProvider.provider, input.provider)).limit(1).then(([item]) => item),
    db.select({ siteUrl: siteSetting.siteUrl }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1).then(([item]) => item),
  ]);
  if (!record) appError("PAYMENT_PROVIDER_NOT_FOUND");
  const urls = mergePaymentUrls(input.provider, settings?.siteUrl, input.values);
  mergePaymentProviderConfig({ provider: input.provider, currentConfigJson: record.configJson, values: { ...input.values, ...urls }, secretUpdates: input.secretUpdates });
  return { provider: input.provider, valid: true };
}

async function setPaymentProviderEnabled(input: { provider: PaymentProviderKind; isEnabled: boolean }) {
  const { db } = requireAdmin();
  const [record] = await db.select().from(paymentProvider).where(eq(paymentProvider.provider, input.provider)).limit(1);
  if (!record) appError("PAYMENT_PROVIDER_NOT_FOUND");
  if (input.isEnabled) {
    try { parseProviderConfig(input.provider, record.configJson); } catch { appError("PAYMENT_CONFIG_INVALID"); }
  }
  await db.update(paymentProvider).set({ isEnabled: input.isEnabled, updatedAt: now() }).where(eq(paymentProvider.provider, input.provider));
  return { provider: input.provider, isEnabled: input.isEnabled };
}

export const onGetPaymentProviders = telefuncAction(internalOnGetPaymentProviders);
export const onGetPaymentProviderForm = telefuncAction(internalOnGetPaymentProviderForm);
export const onSavePaymentProvider = telefuncAction(savePaymentProvider);
export const onGetPaymentLogs = telefuncAction(internalOnGetPaymentLogs);
export const onValidatePaymentProviderConfig = telefuncAction(validatePaymentProviderConfig);
export const onSetPaymentProviderEnabled = telefuncAction(setPaymentProviderEnabled);
