import { asc, eq } from "drizzle-orm";

import { requireAdmin } from "@/server/telefunc-context";
import { paymentProvider } from "@/database/drizzle/schema";
import { validatePaymentProviderConfig, type PaymentProviderKind } from "./config";


function getAdminContext() {
  const { db } = requireAdmin();
  return { db };
}

export async function onGetPaymentProviders() {
  const { db } = getAdminContext();
  return db
    .select({
      id: paymentProvider.id,
      provider: paymentProvider.provider,
      name: paymentProvider.name,
      isEnabled: paymentProvider.isEnabled,
      configJson: paymentProvider.configJson,
      updatedAt: paymentProvider.updatedAt,
    })
    .from(paymentProvider)
    .orderBy(asc(paymentProvider.id));
}

export async function onSavePaymentProvider(input: {
  provider: PaymentProviderKind;
  name: string;
  isEnabled: boolean;
  configJson: string;
}) {
  const { db } = getAdminContext();
  const name = input.name.trim();
  if (!name) throw new Error("PAYMENT_PROVIDER_NAME_REQUIRED");
  validatePaymentProviderConfig(input.provider, input.configJson);

  const now = new Date();
  const saved = await db
    .update(paymentProvider)
    .set({ name, isEnabled: input.isEnabled, configJson: input.configJson, updatedAt: now })
    .where(eq(paymentProvider.provider, input.provider))
    .returning({ id: paymentProvider.id, provider: paymentProvider.provider });
  if (!saved[0]) throw new Error("PAYMENT_PROVIDER_NOT_FOUND");


  return saved[0];
}
