import { asc, eq } from "drizzle-orm";
import { getContext } from "telefunc";
import { createDrizzleDb } from "@/database/drizzle";
import { adminOperationLog, paymentProvider } from "@/database/drizzle/schema";
import { validatePaymentProviderConfig, type PaymentProviderKind } from "./config";

type TelefuncContext = {
  env?: { DB?: D1Database };
  user?: { id: string } | null;
  isAdmin?: boolean;
};

function getAdminContext() {
  const context = getContext<TelefuncContext>();
  if (!context.user || !context.isAdmin || !context.env?.DB) throw new Error("ADMIN_ACCESS_REQUIRED");
  return { db: createDrizzleDb(context.env.DB), adminUserId: context.user.id };
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
  const { db, adminUserId } = getAdminContext();
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

  await db.insert(adminOperationLog).values({
    adminUserId,
    action: "UPDATE_PAYMENT_PROVIDER",
    targetType: "paymentProvider",
    targetId: String(saved[0].id),
    detail: `provider=${saved[0].provider}; enabled=${input.isEnabled}`,
    createdAt: now,
  });

  return saved[0];
}
