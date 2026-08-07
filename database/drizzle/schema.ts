import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = integer("createdAt", { mode: "timestamp_ms" }).notNull();
const updatedAt = integer("updatedAt", { mode: "timestamp_ms" }).notNull();

// Better Auth tables.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  displayUsername: text("displayUsername"),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt,
  updatedAt,
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt,
    updatedAt,
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull().references(() => user.id),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull().references(() => user.id),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt,
    updatedAt,
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
});

// Store operators are Better Auth users with an administrator profile.
export const adminProfile = sqliteTable(
  "adminProfile",
  {
    userId: text("userId").primaryKey().references(() => user.id),
    status: text("status", { enum: ["ACTIVE", "DISABLED"] }).notNull().default("ACTIVE"),
    twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).notNull().default(false),
    twoFactorSecret: text("twoFactorSecret"),
    twoFactorEnabledAt: integer("twoFactorEnabledAt", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [index("adminProfile_status_idx").on(table.status)],
);

// A singleton row makes first-administrator assignment race-safe.
export const adminBootstrap = sqliteTable("adminBootstrap", {
  id: integer("id").primaryKey().default(1),
  userId: text("userId").notNull().references(() => user.id),
  createdAt,
});

export const siteSetting = sqliteTable("siteSetting", {
  id: integer("id").primaryKey().default(1),
  siteName: text("siteName").notNull(),
  siteUrl: text("siteUrl"),
  siteSubtitle: text("siteSubtitle"),
  logo: text("logo"),
  notice: text("notice"),
  supportContact: text("supportContact"),
  footerText: text("footerText"),
  orderNotice: text("orderNotice"),
  headCode: text("headCode"),
  footerCode: text("footerCode"),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  createdAt,
  updatedAt,
});

export const category = sqliteTable(
  "category",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sort: integer("sort").notNull().default(0),
    status: text("status", { enum: ["ACTIVE", "DISABLED"] }).notNull().default("ACTIVE"),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("category_slug_unique").on(table.slug), index("category_status_sort_idx").on(table.status, table.sort)],
);

export const product = sqliteTable(
  "product",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("categoryId").references(() => category.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    coverImage: text("coverImage"),
    price: integer("price").notNull(),
    status: text("status", { enum: ["DRAFT", "ACTIVE", "INACTIVE"] }).notNull().default("DRAFT"),
    deliveryType: text("deliveryType", { enum: ["CARD_AUTO", "FIXED_CARD", "MANUAL", "EXPRESS"] }).notNull().default("CARD_AUTO"),
    fixedDeliveryContent: text("fixedDeliveryContent"),
    manualDeliveryHint: text("manualDeliveryHint"),
    stockMode: text("stockMode", { enum: ["FINITE", "UNLIMITED"] }).notNull().default("FINITE"),
    physicalStock: integer("physicalStock"),
    minBuy: integer("minBuy").notNull().default(1),
    maxBuy: integer("maxBuy").notNull().default(1),
    sort: integer("sort").notNull().default(0),
    isVisibleStock: integer("isVisibleStock", { mode: "boolean" }).notNull().default(true),
    isContactRequired: integer("isContactRequired", { mode: "boolean" }).notNull().default(true),
    purchaseNote: text("purchaseNote"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("product_slug_unique").on(table.slug),
    index("product_categoryId_idx").on(table.categoryId),
    index("product_status_sort_idx").on(table.status, table.sort),
  ],
);

export const discountCode = sqliteTable(
  "discountCode",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    type: text("type", { enum: ["FIXED", "PERCENT"] }).notNull(),
    value: integer("value").notNull(),
    minAmount: integer("minAmount"),
    maxUses: integer("maxUses"),
    usedCount: integer("usedCount").notNull().default(0),
    reservedCount: integer("reservedCount").notNull().default(0),
    productIds: text("productIds"),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("discountCode_code_unique").on(table.code), index("discountCode_active_idx").on(table.isActive)],
);

export const order = sqliteTable(
  "order",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderNo: text("orderNo").notNull(),
    queryToken: text("queryToken").notNull(),
    productId: integer("productId").notNull().references(() => product.id),
    productNameSnapshot: text("productNameSnapshot").notNull(),
    unitPrice: integer("unitPrice").notNull(),
    quantity: integer("quantity").notNull(),
    amount: integer("amount").notNull(),
    contactType: text("contactType", { enum: ["EMAIL", "QQ", "TELEGRAM", "OTHER"] }).notNull().default("EMAIL"),
    contactValue: text("contactValue"),
    buyerNote: text("buyerNote"),
    receiverInfo: text("receiverInfo"),
    paymentProvider: text("paymentProvider").notNull(),
    paymentChannel: text("paymentChannel"),
    paymentOrderNo: text("paymentOrderNo"),
    status: text("status", { enum: ["PENDING", "PAID", "DELIVERED", "CLOSED", "FAILED"] }).notNull().default("PENDING"),
    paymentStatus: text("paymentStatus", { enum: ["UNPAID", "PAID", "FAILED"] }).notNull().default("UNPAID"),
    deliveryStatus: text("deliveryStatus", { enum: ["NOT_DELIVERED", "DELIVERED", "FAILED"] }).notNull().default("NOT_DELIVERED"),
    discountCodeId: integer("discountCodeId").references(() => discountCode.id, { onDelete: "set null" }),
    discountCodeStr: text("discountCodeStr"),
    originalAmount: integer("originalAmount"),
    discountAmount: integer("discountAmount"),
    paidAt: integer("paidAt", { mode: "timestamp_ms" }),
    deliveredAt: integer("deliveredAt", { mode: "timestamp_ms" }),
    closedAt: integer("closedAt", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("order_orderNo_unique").on(table.orderNo),
    index("order_productId_idx").on(table.productId),
    index("order_status_createdAt_idx").on(table.status, table.createdAt),
    index("order_paymentStatus_createdAt_idx").on(table.paymentStatus, table.createdAt),
    index("order_deliveryStatus_createdAt_idx").on(table.deliveryStatus, table.createdAt),
  ],
);

export const card = sqliteTable(
  "card",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("productId").notNull().references(() => product.id),
    content: text("content").notNull(),
    status: text("status", { enum: ["UNUSED", "LOCKED", "SOLD", "DISABLED"] }).notNull().default("UNUSED"),
    batchNo: text("batchNo"),
    orderId: integer("orderId").references(() => order.id, { onDelete: "set null" }),
    soldAt: integer("soldAt", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [index("card_product_status_idx").on(table.productId, table.status), index("card_orderId_idx").on(table.orderId)],
);

export const orderDelivery = sqliteTable(
  "orderDelivery",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("orderId").notNull().references(() => order.id),
    deliveryType: text("deliveryType", { enum: ["CARD", "FIXED_CARD", "MANUAL", "EXPRESS"] }).notNull(),
    contentSnapshot: text("contentSnapshot").notNull(),
    status: text("status", { enum: ["SUCCESS", "FAILED"] }).notNull().default("SUCCESS"),
    createdAt,
  },
  (table) => [
    uniqueIndex("orderDelivery_orderId_unique").on(table.orderId),
    index("orderDelivery_orderId_createdAt_idx").on(table.orderId, table.createdAt),
  ],
);

// Provider-specific fields remain JSON. Credentials are references to Worker Secrets, never secret values.
export const paymentProvider = sqliteTable(
  "paymentProvider",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider", { enum: ["ALIPAY", "EPAY", "BEPUSDT", "STRIPE", "HASHPAY"] }).notNull(),
    name: text("name").notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(false),
    configJson: text("configJson").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("paymentProvider_provider_unique").on(table.provider)],
);

export const paymentLog = sqliteTable(
  "paymentLog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("orderId").references(() => order.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    orderNo: text("orderNo"),
    paymentOrderNo: text("paymentOrderNo"),
    eventType: text("eventType").notNull(),
    rawPayload: text("rawPayload").notNull(),
    verifyStatus: text("verifyStatus", { enum: ["PENDING", "VERIFIED", "FAILED"] }).notNull().default("PENDING"),
    message: text("message"),
    createdAt,
  },
  (table) => [index("paymentLog_provider_createdAt_idx").on(table.provider, table.createdAt), index("paymentLog_orderNo_idx").on(table.orderNo)],
);

export const emailProvider = sqliteTable(
  "emailProvider",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider", { enum: ["API", "SMTP", "CLOUDFLARE"] }).notNull(),
    name: text("name").notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(false),
    configJson: text("configJson").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("emailProvider_provider_unique").on(table.provider)],
);

export const emailTemplate = sqliteTable(
  "emailTemplate",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scene: text("scene", { enum: ["TEST", "ORDER_PAID", "DELIVERY_SUCCESS", "DELIVERY_FAILED"] }).notNull(),
    name: text("name").notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(true),
    templateJson: text("templateJson").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("emailTemplate_scene_unique").on(table.scene)],
);

export const emailLog = sqliteTable(
  "emailLog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("orderId").references(() => order.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    scene: text("scene").notNull(),
    status: text("status", { enum: ["SUCCESS", "FAILED"] }).notNull(),
    toEmail: text("toEmail").notNull(),
    subject: text("subject").notNull(),
    messageId: text("messageId"),
    error: text("error"),
    triggeredBy: text("triggeredBy"),
    createdAt,
  },
  (table) => [index("emailLog_orderId_idx").on(table.orderId), index("emailLog_status_createdAt_idx").on(table.status, table.createdAt)],
);

export const pushConfig = sqliteTable("pushConfig", {
  id: integer("id").primaryKey().default(1),
  isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(true),
  emailEnabled: integer("emailEnabled", { mode: "boolean" }).notNull().default(true),
  wecomEnabled: integer("wecomEnabled", { mode: "boolean" }).notNull().default(false),
  telegramEnabled: integer("telegramEnabled", { mode: "boolean" }).notNull().default(false),
  customerOrderPaid: integer("customerOrderPaid", { mode: "boolean" }).notNull().default(true),
  customerDeliverySuccess: integer("customerDeliverySuccess", { mode: "boolean" }).notNull().default(true),
  customerDeliveryFailed: integer("customerDeliveryFailed", { mode: "boolean" }).notNull().default(false),
  adminOrderPaid: integer("adminOrderPaid", { mode: "boolean" }).notNull().default(false),
  adminDeliverySuccess: integer("adminDeliverySuccess", { mode: "boolean" }).notNull().default(true),
  adminDeliveryFailed: integer("adminDeliveryFailed", { mode: "boolean" }).notNull().default(true),
  createdAt,
  updatedAt,
});

export const pushLog = sqliteTable(
  "pushLog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("orderId").references(() => order.id, { onDelete: "set null" }),
    channel: text("channel", { enum: ["EMAIL", "WECOM", "TELEGRAM"] }).notNull(),
    provider: text("provider").notNull(),
    scene: text("scene", { enum: ["TEST", "ORDER_PAID", "DELIVERY_SUCCESS", "DELIVERY_FAILED"] }).notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    status: text("status", { enum: ["SUCCESS", "FAILED"] }).notNull(),
    messageId: text("messageId"),
    error: text("error"),
    triggeredBy: text("triggeredBy"),
    createdAt,
  },
  (table) => [index("pushLog_channel_createdAt_idx").on(table.channel, table.createdAt), index("pushLog_status_createdAt_idx").on(table.status, table.createdAt), index("pushLog_orderId_idx").on(table.orderId)],
);

export const emailRetry = sqliteTable(
  "emailRetry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    emailLogId: integer("emailLogId").notNull().references(() => emailLog.id),
    provider: text("provider").notNull(),
    providerConfigJson: text("providerConfigJson").notNull(),
    scene: text("scene").notNull(),
    toEmail: text("toEmail").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    format: text("format", { enum: ["text", "html"] }).notNull(),
    status: text("status", { enum: ["PENDING", "SENT", "EXHAUSTED"] }).notNull().default("PENDING"),
    attemptCount: integer("attemptCount").notNull().default(0),
    maxAttempts: integer("maxAttempts").notNull().default(5),
    nextAttemptAt: integer("nextAttemptAt", { mode: "timestamp_ms" }).notNull(),
    lastError: text("lastError"),
    createdAt,
    updatedAt,
  },
  (table) => [index("emailRetry_status_nextAttemptAt_idx").on(table.status, table.nextAttemptAt), index("emailRetry_emailLogId_idx").on(table.emailLogId)],
);

export const adminOperationLog = sqliteTable(
  "adminOperationLog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: text("adminUserId").notNull().references(() => user.id),
    action: text("action").notNull(),
    targetType: text("targetType").notNull(),
    targetId: text("targetId"),
    detail: text("detail"),
    createdAt,
  },
  (table) => [index("adminOperationLog_admin_createdAt_idx").on(table.adminUserId, table.createdAt)],
);

export const s3Config = sqliteTable("s3Config", {
  id: integer("id").primaryKey().default(1),
  configJson: text("configJson").notNull(),
  createdAt,
  updatedAt,
});

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    originalName: text("originalName").notNull(),
    storedName: text("storedName").notNull(),
    mimeType: text("mimeType").notNull(),
    fileSize: integer("fileSize").notNull(),
    fileKey: text("fileKey").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    path: text("path"),
    metadataJson: text("metadataJson"),
    uploadedBy: text("uploadedBy").notNull().references(() => user.id),
    uploadedAt: integer("uploadedAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt,
  },
  (table) => [uniqueIndex("media_storedName_unique").on(table.storedName), uniqueIndex("media_fileKey_unique").on(table.fileKey), index("media_uploadedAt_idx").on(table.uploadedAt)],
);

export const schema = {
  user,
  session,
  account,
  verification,
  adminProfile,
  adminBootstrap,
  siteSetting,
  category,
  product,
  discountCode,
  order,
  card,
  orderDelivery,
  paymentProvider,
  paymentLog,
  emailProvider,
  emailTemplate,
  emailLog,
  pushConfig,
  pushLog,
  emailRetry,
  adminOperationLog,
  s3Config,
  media,
};
