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
  logoIcon: text("logoIcon"),
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

// Provider-specific payment fields are stored in D1 as validated JSON.
export const paymentProvider = sqliteTable(
  "paymentProvider",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(false),
    sort: integer("sort").notNull().default(0),
    configJson: text("configJson").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("paymentProvider_provider_unique").on(table.provider),
    index("paymentProvider_enabled_sort_idx").on(table.isEnabled, table.sort),
  ],
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
  (table) => [
    index("paymentLog_provider_createdAt_idx").on(table.provider, table.createdAt),
    index("paymentLog_orderNo_idx").on(table.orderNo),
    index("paymentLog_orderId_idx").on(table.orderId),
  ],
);

export const pushChannelConfig = sqliteTable(
  "pushChannelConfig",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channel: text("channel", { enum: ["EMAIL", "WECHAT", "TELEGRAM"] }).notNull(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(false),
    configJson: text("configJson").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("pushChannelConfig_channel_provider_idx").on(table.channel, table.provider), index("pushChannelConfig_channel_enabled_idx").on(table.channel, table.isEnabled)],
);

export const emailTemplate = sqliteTable(
  "emailTemplate",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scene: text("scene", { enum: ["TEST", "ORDER_PAID", "DELIVERY_SUCCESS", "DELIVERY_FAILED"] }).notNull(),
    name: text("name").notNull(),
    templateJson: text("templateJson").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("emailTemplate_scene_unique").on(table.scene)],
);

export const pushConfig = sqliteTable("pushConfig", {
  id: integer("id").primaryKey().default(1),
  isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(true),
  createdAt,
  updatedAt,
});

export const pushPolicy = sqliteTable(
  "pushPolicy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageType: text("messageType", { enum: ["NORMAL", "ADMIN"] }).notNull(),
    scene: text("scene", { enum: ["ORDER_PAID", "DELIVERY_SUCCESS", "DELIVERY_FAILED"] }).notNull(),
    channelsJson: text("channelsJson").notNull().default("[]"),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("pushPolicy_messageType_scene_unique").on(table.messageType, table.scene)],
);

export const pushLog = sqliteTable(
  "pushLog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("orderId").references(() => order.id, { onDelete: "set null" }),
    channelConfigId: integer("channelConfigId").references(() => pushChannelConfig.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotencyKey"),
    messageType: text("messageType", { enum: ["NORMAL", "ADMIN"] }).notNull().default("NORMAL"),
    channel: text("channel", { enum: ["EMAIL", "WECHAT", "TELEGRAM"] }).notNull(),
    provider: text("provider").notNull(),
    scene: text("scene", { enum: ["TEST", "ORDER_PAID", "DELIVERY_SUCCESS", "DELIVERY_FAILED"] }).notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    status: text("status", { enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "SKIPPED", "EXHAUSTED"] }).notNull(),
    attemptCount: integer("attemptCount").notNull().default(0),
    messageId: text("messageId"),
    error: text("error"),
    triggeredBy: text("triggeredBy"),
    createdAt,
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
  },
  (table) => [uniqueIndex("pushLog_idempotencyKey_unique").on(table.idempotencyKey), index("pushLog_channel_createdAt_idx").on(table.channel, table.createdAt), index("pushLog_status_createdAt_idx").on(table.status, table.createdAt), index("pushLog_orderId_idx").on(table.orderId)],
);

export const pushRetry = sqliteTable(
  "pushRetry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pushLogId: integer("pushLogId").notNull().references(() => pushLog.id, { onDelete: "cascade" }),
    payloadJson: text("payloadJson").notNull(),
    status: text("status", { enum: ["PENDING", "PROCESSING", "EXHAUSTED"] }).notNull().default("PENDING"),
    attemptCount: integer("attemptCount").notNull().default(0),
    maxAttempts: integer("maxAttempts").notNull().default(5),
    nextAttemptAt: integer("nextAttemptAt", { mode: "timestamp_ms" }).notNull(),
    lastError: text("lastError"),
    createdAt,
    updatedAt,
  },
  (table) => [index("pushRetry_status_nextAttemptAt_idx").on(table.status, table.nextAttemptAt), uniqueIndex("pushRetry_pushLogId_unique").on(table.pushLogId)],
);


export const orderCloseCompensation = sqliteTable(
  "orderCloseCompensation",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("orderId").notNull().references(() => order.id, { onDelete: "cascade" }),
    productId: integer("productId").notNull(),
    quantity: integer("quantity").notNull(),
    deliveryType: text("deliveryType", { enum: ["CARD_AUTO", "MANUAL", "EXPRESS", "FIXED_CARD"] }).notNull(),
    discountCodeId: integer("discountCodeId"),
    cardsReleased: integer("cardsReleased", { mode: "boolean" }).notNull().default(false),
    stockRestored: integer("stockRestored", { mode: "boolean" }).notNull().default(false),
    discountReleased: integer("discountReleased", { mode: "boolean" }).notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    status: text("status", { enum: ["PENDING", "EXHAUSTED"] }).notNull().default("PENDING"),
    lastError: text("lastError"),
    nextAttemptAt: integer("nextAttemptAt", { mode: "timestamp_ms" }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("orderCloseCompensation_orderId_unique").on(table.orderId), index("orderCloseCompensation_nextAttemptAt_idx").on(table.nextAttemptAt)],
);

export const scheduledTaskRun = sqliteTable(
  "scheduledTaskRun",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task: text("task", { enum: ["MAINTENANCE"] }).notNull(),
    status: text("status", { enum: ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] }).notNull(),
    scannedOrderCount: integer("scannedOrderCount"),
    closedOrderCount: integer("closedOrderCount"),
    compensationRetried: integer("compensationRetried"),
    compensationFailed: integer("compensationFailed"),
    compensationExhausted: integer("compensationExhausted"),
    pushRetryAttempted: integer("pushRetryAttempted"),
    pushRetrySent: integer("pushRetrySent"),
    error: text("error"),
    startedAt: integer("startedAt", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completedAt", { mode: "timestamp_ms" }),
  },
  (table) => [index("scheduledTaskRun_task_startedAt_idx").on(table.task, table.startedAt)],
);

export const s3Config = sqliteTable("s3Config", {
  id: integer("id").primaryKey().default(1),
  configJson: text("configJson").notNull(),
  accessKeyId: text("accessKeyId"),
  secretAccessKey: text("secretAccessKey"),
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
    path: text("path"),
    metadataJson: text("metadataJson"),
    uploadedBy: text("uploadedBy").notNull().references(() => user.id),
    uploadedAt: integer("uploadedAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt,
  },
  (table) => [uniqueIndex("media_fileKey_unique").on(table.fileKey), index("media_mimeType_idx").on(table.mimeType), index("media_path_idx").on(table.path), index("media_uploadedAt_id_idx").on(table.uploadedAt, table.id)],
);

export const schema = {
  user,
  session,
  account,
  verification,
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
  pushChannelConfig,
  emailTemplate,

  pushConfig,
  pushPolicy,
  pushLog,
  pushRetry,
  scheduledTaskRun,
  orderCloseCompensation,

  s3Config,
  media,
};
