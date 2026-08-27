import { z } from "zod";

export const supplierProviderSchema = z.enum(["acg", "dujiao_next"]);
export type SupplierProvider = z.infer<typeof supplierProviderSchema>;

export const acgProtocolVersionSchema = z.enum(["acg_v3.1.2_plus", "acg_v3.1.1"]);
export type AcgProtocolVersion = z.infer<typeof acgProtocolVersionSchema>;
export const dujiaoNextProtocolVersion = "dujiao_next_v1" as const;
export const supplierProtocolVersionSchema = z.union([acgProtocolVersionSchema, z.literal(dujiaoNextProtocolVersion)]);

export function protocolVersionForProvider(provider: SupplierProvider, protocolVersion: string) {
  if (provider === "acg" && acgProtocolVersionSchema.safeParse(protocolVersion).success) return protocolVersion as AcgProtocolVersion;
  if (provider === "dujiao_next" && protocolVersion === dujiaoNextProtocolVersion) return dujiaoNextProtocolVersion;
  throw new Error("supplier_protocol_version_invalid");
}

export function normalizeLegacyProtocolVersion(provider: SupplierProvider, protocolVersion: string) {
  if (provider === "acg" && protocolVersion === "3.5.5-v4") return "acg_v3.1.2_plus" as const;
  if (provider === "dujiao_next" && protocolVersion === "1.3.1-upstream-v1") return dujiaoNextProtocolVersion;
  return protocolVersionForProvider(provider, protocolVersion);
}

export const supplierPurchaseContextSchema = z.object({
  code: z.string().max(512).optional(),
  race: z.string().max(512).optional(),
  sku: z.record(z.string().max(256), z.string().max(2048)).optional(),
  cardId: z.number().int().positive().optional(),
  widget: z.record(z.string().max(256), z.string().max(2048)).optional(),
  deliveryWay: z.number().int().optional(),
}).strict();
export type SupplierPurchaseContext = z.infer<typeof supplierPurchaseContextSchema>;

export const supplierOrderStateSchema = z.enum([
  "pending",
  "selecting",
  "submitting",
  "processing",
  "uncertain",
  "supplied",
  "failed",
  "refunded",
]);
export type SupplierOrderState = z.infer<typeof supplierOrderStateSchema>;

export const supplierHealthStatusSchema = z.enum([
  "unknown",
  "healthy",
  "degraded",
  "unavailable",
]);

const minorAmountSchema = z.string().regex(/^(0|[1-9]\d*)$/).max(64);
const baseUrlSchema = z.string().trim().min(1).max(2048);

export const supplierAccountEditSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  baseUrl: baseUrlSchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  currencyDecimals: z.number().int().min(0).max(8),
  credentials: z.union([z.object({ apiId: z.string().trim().min(1).max(256), appKey: z.string().min(1).max(1024) }).strict(), z.object({ apiKey: z.string().trim().min(1).max(512), apiSecret: z.string().min(1).max(1024) }).strict()]).optional(),
}).strict();

export const supplierAccountInputSchema = z.object({
  id: z.string().optional(),
  provider: supplierProviderSchema,
  protocolVersion: supplierProtocolVersionSchema,
  baseUrl: baseUrlSchema,
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  currencyDecimals: z.number().int().min(0).max(8),
  reserveBalanceMinor: minorAmountSchema,
  lowBalanceMinor: minorAmountSchema,
  maxOrderCostMinor: minorAmountSchema.nullable(),
  enabled: z.boolean(),
  credentials: z.unknown().optional(),
});

export const supplierAccountIdSchema = z.object({ id: z.string().min(1).max(128) });
export const supplierListQuerySchema = z.object({ search: z.string().trim().max(120).optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(100).optional() });
export const supplierOrderListQuerySchema = z.object({ query: z.string().trim().max(120).optional(), state: supplierOrderStateSchema.optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(100).optional() });
export const supplierAccountEnabledSchema = supplierAccountIdSchema.extend({ enabled: z.boolean() });
export const supplierSourceInputSchema = z.object({ provider: supplierProviderSchema, baseUrl: baseUrlSchema });
export const supplierOrderActionSchema = z.object({ id: z.number().int().positive() });

export const supplierSyncSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalMs: z.number().int().min(10 * 60_000).max(30 * 86_400_000),
});

export const acgCredentialsSchema = z.object({
  apiId: z.string().trim().min(1).max(256),
  appKey: z.string().min(1).max(1024),
});

export const dujiaoNextCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1).max(512),
  apiSecret: z.string().min(1).max(1024),
});

export const supplierCredentialsSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("acg"), credentials: acgCredentialsSchema }),
  z.object({ provider: z.literal("dujiao_next"), credentials: dujiaoNextCredentialsSchema }),
]);

export const supplierPurchaseResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("supplied"), upstreamOrderId: z.string().min(1), cards: z.array(z.string().min(1)).min(1) }),
  z.object({ status: z.literal("processing"), upstreamOrderId: z.string().min(1) }),
  z.object({ status: z.literal("definitively_failed"), errorCode: z.string().min(1) }),
  z.object({ status: z.literal("uncertain"), upstreamOrderId: z.string().nullable(), errorCode: z.string().min(1) }),
]);
export type SupplierPurchaseResult = z.infer<typeof supplierPurchaseResultSchema>;
