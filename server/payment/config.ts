import { asc, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { paymentProvider } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { getProviderDefinition, parseProviderConfig, type PaymentChannel, type PaymentProviderKind } from "./registry";

export type { PaymentProviderKind } from "./registry";

export type PublicPaymentProvider = {
  provider: PaymentProviderKind;
  name: string;
  channels: PaymentChannel[];
  configStatus: "valid" | "invalid";
};

export type EnabledPaymentProvider = PublicPaymentProvider & {
  configJson: string;
  isEnabled: boolean;
};

export function validatePaymentProviderConfig(provider: PaymentProviderKind, configJson: string) {
  return parseProviderConfig(provider, configJson);
}

export async function getEnabledPaymentProviders(database: D1Database): Promise<PublicPaymentProvider[]> {
  const db = createDrizzleDb(database);
  const records = await db
    .select({ provider: paymentProvider.provider, name: paymentProvider.name, configJson: paymentProvider.configJson })
    .from(paymentProvider)
    .where(eq(paymentProvider.isEnabled, true))
    .orderBy(asc(paymentProvider.sort), asc(paymentProvider.id));

  return records.flatMap((record) => {
    try {
      const definition = getProviderDefinition(record.provider);
      if (!definition) return [];
      const config = parseProviderConfig(record.provider, record.configJson);
      return [{ provider: record.provider as PaymentProviderKind, name: record.name, channels: definition.getChannels(config), configStatus: "valid" as const }];
    } catch {
      return [];
    }
  });
}

export async function getPaymentProvider(database: D1Database, provider: PaymentProviderKind): Promise<EnabledPaymentProvider | null> {
  const db = createDrizzleDb(database);
  const [record] = await db
    .select({ provider: paymentProvider.provider, name: paymentProvider.name, isEnabled: paymentProvider.isEnabled, configJson: paymentProvider.configJson })
    .from(paymentProvider)
    .where(eq(paymentProvider.provider, provider))
    .limit(1);
  if (!record) return null;
  const definition = getProviderDefinition(record.provider);
  if (!definition) return null;
  try {
    const config = parseProviderConfig(record.provider, record.configJson);
    return { provider: record.provider as PaymentProviderKind, name: record.name, channels: definition.getChannels(config), configStatus: "valid", configJson: record.configJson, isEnabled: record.isEnabled };
  } catch {
    return { provider: record.provider as PaymentProviderKind, name: record.name, channels: [], configStatus: "invalid", configJson: record.configJson, isEnabled: record.isEnabled };
  }
}

export async function getEnabledPaymentProvider(database: D1Database, provider: PaymentProviderKind) {
  const record = await getPaymentProvider(database, provider);
  if (!record?.isEnabled || record.configStatus !== "valid") return null;
  return record;
}

export function requirePaymentChannel(provider: PaymentProviderKind, configJson: string, channel: string | undefined) {
  const definition = getProviderDefinition(provider);
  if (!definition) appError("PAYMENT_PROVIDER_NOT_IMPLEMENTED");
  const config = parseProviderConfig(provider, configJson);
  const selected = channel || definition.getChannels(config)[0];
  if (selected && !definition.getChannels(config).includes(selected as PaymentChannel)) appError("PAYMENT_CHANNEL_INVALID");
  return selected as PaymentChannel | undefined;
}
