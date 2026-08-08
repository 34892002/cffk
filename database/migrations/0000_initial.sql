CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `adminBootstrap` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productId` integer NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'UNUSED' NOT NULL,
	`batchNo` text,
	`orderId` integer,
	`soldAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_product_status_idx` ON `card` (`productId`,`status`);--> statement-breakpoint
CREATE INDEX `card_orderId_idx` ON `card` (`orderId`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_status_sort_idx` ON `category` (`status`,`sort`);--> statement-breakpoint
CREATE TABLE `discountCode` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`minAmount` integer,
	`maxUses` integer,
	`usedCount` integer DEFAULT 0 NOT NULL,
	`reservedCount` integer DEFAULT 0 NOT NULL,
	`productIds` text,
	`expiresAt` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discountCode_code_unique` ON `discountCode` (`code`);--> statement-breakpoint
CREATE INDEX `discountCode_active_idx` ON `discountCode` (`isActive`);--> statement-breakpoint
CREATE TABLE `emailTemplate` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scene` text NOT NULL,
	`name` text NOT NULL,
	`templateJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emailTemplate_scene_unique` ON `emailTemplate` (`scene`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`originalName` text NOT NULL,
	`storedName` text NOT NULL,
	`mimeType` text NOT NULL,
	`fileSize` integer NOT NULL,
	`fileKey` text NOT NULL,
	`url` text NOT NULL,
	`thumbnailUrl` text,
	`path` text,
	`metadataJson` text,
	`uploadedBy` text NOT NULL,
	`uploadedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`uploadedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_storedName_unique` ON `media` (`storedName`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_fileKey_unique` ON `media` (`fileKey`);--> statement-breakpoint
CREATE INDEX `media_uploadedAt_idx` ON `media` (`uploadedAt`);--> statement-breakpoint
CREATE TABLE `order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderNo` text NOT NULL,
	`queryToken` text NOT NULL,
	`productId` integer NOT NULL,
	`productNameSnapshot` text NOT NULL,
	`unitPrice` integer NOT NULL,
	`quantity` integer NOT NULL,
	`amount` integer NOT NULL,
	`contactType` text DEFAULT 'EMAIL' NOT NULL,
	`contactValue` text,
	`buyerNote` text,
	`receiverInfo` text,
	`paymentProvider` text NOT NULL,
	`paymentChannel` text,
	`paymentOrderNo` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`paymentStatus` text DEFAULT 'UNPAID' NOT NULL,
	`deliveryStatus` text DEFAULT 'NOT_DELIVERED' NOT NULL,
	`discountCodeId` integer,
	`discountCodeStr` text,
	`originalAmount` integer,
	`discountAmount` integer,
	`paidAt` integer,
	`deliveredAt` integer,
	`closedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`discountCodeId`) REFERENCES `discountCode`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_orderNo_unique` ON `order` (`orderNo`);--> statement-breakpoint
CREATE INDEX `order_productId_idx` ON `order` (`productId`);--> statement-breakpoint
CREATE INDEX `order_status_createdAt_idx` ON `order` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_paymentStatus_createdAt_idx` ON `order` (`paymentStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_deliveryStatus_createdAt_idx` ON `order` (`deliveryStatus`,`createdAt`);--> statement-breakpoint
CREATE TABLE `orderDelivery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderId` integer NOT NULL,
	`deliveryType` text NOT NULL,
	`contentSnapshot` text NOT NULL,
	`status` text DEFAULT 'SUCCESS' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orderDelivery_orderId_unique` ON `orderDelivery` (`orderId`);--> statement-breakpoint
CREATE INDEX `orderDelivery_orderId_createdAt_idx` ON `orderDelivery` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `paymentLog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderId` integer,
	`provider` text NOT NULL,
	`orderNo` text,
	`paymentOrderNo` text,
	`eventType` text NOT NULL,
	`rawPayload` text NOT NULL,
	`verifyStatus` text DEFAULT 'PENDING' NOT NULL,
	`message` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `paymentLog_provider_createdAt_idx` ON `paymentLog` (`provider`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paymentLog_orderNo_idx` ON `paymentLog` (`orderNo`);--> statement-breakpoint
CREATE INDEX `paymentLog_orderId_idx` ON `paymentLog` (`orderId`);--> statement-breakpoint
CREATE TABLE `paymentProvider` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`isEnabled` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`configJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paymentProvider_provider_unique` ON `paymentProvider` (`provider`);--> statement-breakpoint
CREATE INDEX `paymentProvider_enabled_sort_idx` ON `paymentProvider` (`isEnabled`,`sort`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoryId` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`subtitle` text,
	`description` text,
	`coverImage` text,
	`price` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`deliveryType` text DEFAULT 'CARD_AUTO' NOT NULL,
	`fixedDeliveryContent` text,
	`manualDeliveryHint` text,
	`stockMode` text DEFAULT 'FINITE' NOT NULL,
	`physicalStock` integer,
	`minBuy` integer DEFAULT 1 NOT NULL,
	`maxBuy` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`isVisibleStock` integer DEFAULT true NOT NULL,
	`isContactRequired` integer DEFAULT true NOT NULL,
	`purchaseNote` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_slug_unique` ON `product` (`slug`);--> statement-breakpoint
CREATE INDEX `product_categoryId_idx` ON `product` (`categoryId`);--> statement-breakpoint
CREATE INDEX `product_status_sort_idx` ON `product` (`status`,`sort`);--> statement-breakpoint
CREATE TABLE `pushChannelConfig` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`isEnabled` integer DEFAULT false NOT NULL,
	`configJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pushChannelConfig_channel_provider_idx` ON `pushChannelConfig` (`channel`,`provider`);--> statement-breakpoint
CREATE INDEX `pushChannelConfig_channel_enabled_idx` ON `pushChannelConfig` (`channel`,`isEnabled`);--> statement-breakpoint
CREATE TABLE `pushConfig` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`isEnabled` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pushLog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderId` integer,
	`channelConfigId` integer,
	`idempotencyKey` text,
	`messageType` text DEFAULT 'NORMAL' NOT NULL,
	`channel` text NOT NULL,
	`provider` text NOT NULL,
	`scene` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text,
	`status` text NOT NULL,
	`attemptCount` integer DEFAULT 0 NOT NULL,
	`messageId` text,
	`error` text,
	`triggeredBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`channelConfigId`) REFERENCES `pushChannelConfig`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pushLog_idempotencyKey_unique` ON `pushLog` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `pushLog_channel_createdAt_idx` ON `pushLog` (`channel`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pushLog_status_createdAt_idx` ON `pushLog` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pushLog_orderId_idx` ON `pushLog` (`orderId`);--> statement-breakpoint
CREATE TABLE `pushPolicy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`messageType` text NOT NULL,
	`scene` text NOT NULL,
	`channelsJson` text DEFAULT '[]' NOT NULL,
	`isEnabled` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pushPolicy_messageType_scene_unique` ON `pushPolicy` (`messageType`,`scene`);--> statement-breakpoint
CREATE TABLE `pushRetry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pushLogId` integer NOT NULL,
	`payloadJson` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attemptCount` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 5 NOT NULL,
	`nextAttemptAt` integer NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`pushLogId`) REFERENCES `pushLog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pushRetry_status_nextAttemptAt_idx` ON `pushRetry` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `pushRetry_pushLogId_unique` ON `pushRetry` (`pushLogId`);--> statement-breakpoint
CREATE TABLE `s3Config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`configJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `siteSetting` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`siteName` text NOT NULL,
	`siteUrl` text,
	`siteSubtitle` text,
	`logo` text,
	`logoIcon` text,
	`notice` text,
	`supportContact` text,
	`footerText` text,
	`orderNotice` text,
	`headCode` text,
	`footerCode` text,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`username` text,
	`displayUsername` text,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
