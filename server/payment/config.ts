import { asc, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { paymentProvider } from "@/database/drizzle/schema";
import { parseAlipayConfig } from "@/lib/config-schemas";

export type PaymentProviderKind = "ALIPAY" | "EPAY" | "BEPUSDT" | "STRIPE" | "HASHPAY";

export type PublicPaymentProvider = {
  provider: PaymentProviderKind;
  name: string;
  channel: string | null;
};

export type EnabledPaymentProvider = PublicPaymentProvider & {
  configJson: string;
};

export function validatePaymentProviderConfig(provider: PaymentProviderKind, configJson: string) {
  if (provider !== "ALIPAY") throw new Error("PAYMENT_PROVIDER_NOT_IMPLEMENTED");
  return parseAlipayConfig(configJson);
}

export async function getEnabledPaymentProviders(database: D1Database): Promise<PublicPaymentProvider[]> {
  const db = createDrizzleDb(database);
  const records = await db
    .select({ provider: paymentProvider.provider, name: paymentProvider.name, configJson: paymentProvider.configJson })
    .from(paymentProvider)
    .where(eq(paymentProvider.isEnabled, true))
    .orderBy(asc(paymentProvider.id));

  return records.flatMap((record) => {
    try {
      const config = validatePaymentProviderConfig(record.provider, record.configJson);
      return [{ provider: record.provider, name: record.name, channel: config.mode }];
    } catch {
      return [];
    }
  });
}

export async function getPaymentProvider(database: D1Database, provider: PaymentProviderKind): Promise<(EnabledPaymentProvider & { isEnabled: boolean }) | null> {
  const db = createDrizzleDb(database);
  const [record] = await db
    .select({ provider: paymentProvider.provider, name: paymentProvider.name, isEnabled: paymentProvider.isEnabled, configJson: paymentProvider.configJson })
    .from(paymentProvider)
    .where(eq(paymentProvider.provider, provider))
    .limit(1);
  if (!record) return null;

  try {
    const config = validatePaymentProviderConfig(record.provider, record.configJson);
    return { provider: record.provider, name: record.name, channel: config.mode, configJson: record.configJson, isEnabled: record.isEnabled };
  } catch {
    return null;
  }
}

export async function getEnabledPaymentProvider(database: D1Database, provider: PaymentProviderKind): Promise<EnabledPaymentProvider | null> {
  const record = await getPaymentProvider(database, provider);
  if (!record?.isEnabled) return null;
  const { isEnabled: _isEnabled, ...enabled } = record;
  return enabled;
}
