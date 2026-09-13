PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__backup_supplierOrder` AS SELECT * FROM `supplierOrder`;--> statement-breakpoint
DROP TABLE `supplierOrder`;--> statement-breakpoint
CREATE TABLE `__backup_pushRetry` AS SELECT * FROM `pushRetry`;--> statement-breakpoint
DROP TABLE `pushRetry`;--> statement-breakpoint
CREATE TABLE `__backup_automaticDeliveryJob` AS SELECT * FROM `automaticDeliveryJob`;--> statement-breakpoint
DROP TABLE `automaticDeliveryJob`;--> statement-breakpoint
CREATE TABLE `__backup_card` AS SELECT * FROM `card`;--> statement-breakpoint
DROP TABLE `card`;--> statement-breakpoint
CREATE TABLE `__backup_orderDelivery` AS SELECT * FROM `orderDelivery`;--> statement-breakpoint
DROP TABLE `orderDelivery`;--> statement-breakpoint
CREATE TABLE `__backup_orderEvent` AS SELECT * FROM `orderEvent`;--> statement-breakpoint
DROP TABLE `orderEvent`;--> statement-breakpoint
CREATE TABLE `__backup_paymentAttempt` AS SELECT * FROM `paymentAttempt`;--> statement-breakpoint
DROP TABLE `paymentAttempt`;--> statement-breakpoint
CREATE TABLE `__backup_paymentLog` AS SELECT * FROM `paymentLog`;--> statement-breakpoint
DROP TABLE `paymentLog`;--> statement-breakpoint
CREATE TABLE `__backup_pushLog` AS SELECT * FROM `pushLog`;--> statement-breakpoint
DROP TABLE `pushLog`;--> statement-breakpoint

CREATE TABLE `__new_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderNo` text NOT NULL,
	`ownerUserId` text,
	`productId` integer,
	`productSkuId` integer,
	`productNameSnapshot` text NOT NULL,
	`productSkuNameSnapshot` text,
	`unitPrice` integer NOT NULL,
	`quantity` integer NOT NULL,
	`amount` integer NOT NULL,
	`contactType` text DEFAULT 'EMAIL' NOT NULL,
	`contactValue` text,
	`contactEmailNormalized` text,
	`buyerNote` text,
	`addressSnapshotJson` text,
	`paymentProvider` text NOT NULL,
	`paymentChannel` text,
	`fulfillmentSourceSnapshot` text DEFAULT 'LOCAL' NOT NULL,
	`deliveryTypeSnapshot` text NOT NULL,
	`fixedDeliveryContentSnapshot` text,
	`physicalStockReserved` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`paymentStatus` text DEFAULT 'UNPAID' NOT NULL,
	`deliveryStatus` text DEFAULT 'NOT_DELIVERED' NOT NULL,
	`deliveryToken` text,
	`deliveryLeaseUntil` integer,
	`discountCodeId` integer,
	`discountCodeStr` text,
	`originalAmount` integer,
	`discountAmount` integer,
	`paidAt` integer,
	`deliveredAt` integer,
	`closedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`ownerUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`productId`) REFERENCES `product_v2`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`discountCodeId`) REFERENCES `discountCode`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_order`("id", "orderNo", "ownerUserId", "productId", "productSkuId", "productNameSnapshot", "productSkuNameSnapshot", "unitPrice", "quantity", "amount", "contactType", "contactValue", "contactEmailNormalized", "buyerNote", "addressSnapshotJson", "paymentProvider", "paymentChannel", "fulfillmentSourceSnapshot", "deliveryTypeSnapshot", "fixedDeliveryContentSnapshot", "physicalStockReserved", "status", "paymentStatus", "deliveryStatus", "deliveryToken", "deliveryLeaseUntil", "discountCodeId", "discountCodeStr", "originalAmount", "discountAmount", "paidAt", "deliveredAt", "closedAt", "createdAt", "updatedAt") SELECT "id", "orderNo", CASE WHEN EXISTS (SELECT 1 FROM `user` u WHERE u.id = `order`.ownerUserId) THEN "ownerUserId" ELSE NULL END, CASE WHEN EXISTS (SELECT 1 FROM `product_v2` p WHERE p.id = `order`.productId) THEN "productId" ELSE NULL END, CASE WHEN EXISTS (SELECT 1 FROM `productSku` s WHERE s.id = `order`.productSkuId) THEN "productSkuId" ELSE NULL END, "productNameSnapshot", "productSkuNameSnapshot", "unitPrice", "quantity", "amount", "contactType", "contactValue", "contactEmailNormalized", "buyerNote", "addressSnapshotJson", "paymentProvider", "paymentChannel", "fulfillmentSourceSnapshot", "deliveryTypeSnapshot", "fixedDeliveryContentSnapshot", "physicalStockReserved", "status", "paymentStatus", "deliveryStatus", "deliveryToken", "deliveryLeaseUntil", CASE WHEN EXISTS (SELECT 1 FROM `discountCode` d WHERE d.id = `order`.discountCodeId) THEN "discountCodeId" ELSE NULL END, "discountCodeStr", "originalAmount", "discountAmount", "paidAt", "deliveredAt", "closedAt", "createdAt", "updatedAt" FROM `order`;--> statement-breakpoint
ALTER TABLE `order` RENAME TO `__old_order`;--> statement-breakpoint
ALTER TABLE `__new_order` RENAME TO `order`;--> statement-breakpoint
DROP TABLE `__old_order`;--> statement-breakpoint

CREATE UNIQUE INDEX `order_orderNo_unique` ON `order` (`orderNo`);--> statement-breakpoint
CREATE INDEX `order_productId_idx` ON `order` (`productId`);--> statement-breakpoint
CREATE INDEX `order_ownerUserId_createdAt_idx` ON `order` (`ownerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_guestEmail_createdAt_idx` ON `order` (`contactEmailNormalized`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_status_createdAt_idx` ON `order` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_paymentStatus_createdAt_idx` ON `order` (`paymentStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_deliveryStatus_createdAt_idx` ON `order` (`deliveryStatus`,`createdAt`);--> statement-breakpoint
CREATE TABLE `card` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `productId` integer NOT NULL, `productSkuId` integer, `content` text NOT NULL, `status` text DEFAULT 'UNUSED' NOT NULL, `batchNo` text, `orderId` integer, `soldAt` integer, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL, FOREIGN KEY (`productId`) REFERENCES `product_v2`(`id`), FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`), FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE set null);--> statement-breakpoint
INSERT INTO `card` SELECT * FROM `__backup_card`;--> statement-breakpoint
CREATE INDEX `card_product_status_idx` ON `card` (`productId`,`status`);--> statement-breakpoint
CREATE INDEX `card_orderId_idx` ON `card` (`orderId`);--> statement-breakpoint
CREATE TABLE `orderDelivery` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `orderId` integer NOT NULL, `deliveryType` text NOT NULL, `attemptToken` text NOT NULL, `contentSnapshot` text, `errorCode` text, `status` text DEFAULT 'SUCCESS' NOT NULL, `createdAt` integer NOT NULL, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`));--> statement-breakpoint
INSERT INTO `orderDelivery` SELECT * FROM `__backup_orderDelivery`;--> statement-breakpoint
CREATE UNIQUE INDEX `orderDelivery_attemptToken_unique` ON `orderDelivery` (`attemptToken`);--> statement-breakpoint
CREATE INDEX `orderDelivery_orderId_createdAt_idx` ON `orderDelivery` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `paymentAttempt` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `orderId` integer NOT NULL, `provider` text NOT NULL, `channel` text, `paymentOrderNo` text, `status` text DEFAULT 'CREATING' NOT NULL, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE cascade);--> statement-breakpoint
INSERT INTO `paymentAttempt` SELECT * FROM `__backup_paymentAttempt`;--> statement-breakpoint
CREATE INDEX `paymentAttempt_orderId_createdAt_idx` ON `paymentAttempt` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paymentAttempt_provider_paymentOrderNo_idx` ON `paymentAttempt` (`provider`,`paymentOrderNo`);--> statement-breakpoint
CREATE TABLE `paymentLog` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `orderId` integer, `provider` text NOT NULL, `orderNo` text, `paymentOrderNo` text, `eventType` text NOT NULL, `rawPayload` text NOT NULL, `verifyStatus` text DEFAULT 'PENDING' NOT NULL, `message` text, `createdAt` integer NOT NULL, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE set null);--> statement-breakpoint
INSERT INTO `paymentLog` SELECT * FROM `__backup_paymentLog`;--> statement-breakpoint
CREATE INDEX `paymentLog_provider_createdAt_idx` ON `paymentLog` (`provider`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paymentLog_orderNo_idx` ON `paymentLog` (`orderNo`);--> statement-breakpoint
CREATE INDEX `paymentLog_orderId_idx` ON `paymentLog` (`orderId`);--> statement-breakpoint
CREATE TABLE `automaticDeliveryJob` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `orderId` integer NOT NULL, `status` text DEFAULT 'PENDING' NOT NULL, `leaseUntil` integer, `attemptCount` integer DEFAULT 0 NOT NULL, `lastError` text, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE cascade);--> statement-breakpoint
INSERT INTO `automaticDeliveryJob` SELECT * FROM `__backup_automaticDeliveryJob`;--> statement-breakpoint
CREATE UNIQUE INDEX `automaticDeliveryJob_orderId_unique` ON `automaticDeliveryJob` (`orderId`);--> statement-breakpoint
CREATE INDEX `automaticDeliveryJob_status_id_idx` ON `automaticDeliveryJob` (`status`,`id`);--> statement-breakpoint
CREATE TABLE `orderEvent` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `eventKey` text NOT NULL, `orderId` integer NOT NULL, `scene` text NOT NULL, `errorMessage` text, `status` text DEFAULT 'PENDING' NOT NULL, `attemptCount` integer DEFAULT 0 NOT NULL, `availableAt` integer NOT NULL, `leaseUntil` integer, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE cascade);--> statement-breakpoint
INSERT INTO `orderEvent` SELECT * FROM `__backup_orderEvent`;--> statement-breakpoint
CREATE UNIQUE INDEX `orderEvent_eventKey_unique` ON `orderEvent` (`eventKey`);--> statement-breakpoint
CREATE INDEX `orderEvent_status_availableAt_idx` ON `orderEvent` (`status`,`availableAt`);--> statement-breakpoint
CREATE TABLE `pushLog` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `orderId` integer, `channelConfigId` integer, `idempotencyKey` text, `messageType` text DEFAULT 'NORMAL' NOT NULL, `channel` text NOT NULL, `provider` text NOT NULL, `scene` text NOT NULL, `recipient` text NOT NULL, `subject` text, `status` text NOT NULL, `attemptCount` integer DEFAULT 0 NOT NULL, `messageId` text, `error` text, `triggeredBy` text, `createdAt` integer NOT NULL, `updatedAt` integer, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE set null, FOREIGN KEY (`channelConfigId`) REFERENCES `pushChannelConfig`(`id`) ON DELETE set null);--> statement-breakpoint
INSERT INTO `pushLog` SELECT * FROM `__backup_pushLog`;--> statement-breakpoint
CREATE UNIQUE INDEX `pushLog_idempotencyKey_unique` ON `pushLog` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `pushLog_channel_createdAt_idx` ON `pushLog` (`channel`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pushLog_status_createdAt_idx` ON `pushLog` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pushLog_orderId_idx` ON `pushLog` (`orderId`);--> statement-breakpoint
CREATE TABLE `pushRetry` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `pushLogId` integer NOT NULL, `payloadJson` text NOT NULL, `status` text DEFAULT 'PENDING' NOT NULL, `attemptCount` integer DEFAULT 0 NOT NULL, `maxAttempts` integer DEFAULT 3 NOT NULL, `nextAttemptAt` integer NOT NULL, `lastError` text, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL, FOREIGN KEY (`pushLogId`) REFERENCES `pushLog`(`id`) ON DELETE cascade);--> statement-breakpoint
INSERT INTO `pushRetry` SELECT * FROM `__backup_pushRetry`;--> statement-breakpoint
CREATE INDEX `pushRetry_status_nextAttemptAt_idx` ON `pushRetry` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `pushRetry_pushLogId_unique` ON `pushRetry` (`pushLogId`);--> statement-breakpoint
CREATE TABLE `supplierOrder` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `orderId` integer NOT NULL, `productSkuId` integer NOT NULL, `supplierBindingId` integer NOT NULL, `deliveryRecordId` integer, `selectedAccountId` text, `selectedCredentialsRevision` integer, `providerRequestNo` text, `upstreamOrderId` text, `quantity` integer NOT NULL, `quotedUnitCostMinor` text, `totalCostMinor` text, `currency` text DEFAULT 'CNY' NOT NULL, `bindingSnapshotJson` text NOT NULL, `state` text DEFAULT 'pending' NOT NULL, `attemptCount` integer DEFAULT 0 NOT NULL, `selectionCount` integer DEFAULT 0 NOT NULL, `accountLockedAt` integer, `nextRetryAt` integer, `lastErrorCode` text, `lastErrorMessage` text, `submittedAt` integer, `suppliedAt` integer, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL, FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE cascade, FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`), FOREIGN KEY (`supplierBindingId`) REFERENCES `supplierBinding`(`id`), FOREIGN KEY (`deliveryRecordId`) REFERENCES `orderDelivery`(`id`) ON DELETE set null, FOREIGN KEY (`selectedAccountId`) REFERENCES `supplierAccount`(`id`));--> statement-breakpoint
INSERT INTO `supplierOrder` SELECT * FROM `__backup_supplierOrder`;--> statement-breakpoint
CREATE UNIQUE INDEX `supplierOrder_order_unique` ON `supplierOrder` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `supplierOrder_account_request_unique` ON `supplierOrder` (`selectedAccountId`,`providerRequestNo`);--> statement-breakpoint
CREATE INDEX `supplierOrder_state_retry_idx` ON `supplierOrder` (`state`,`nextRetryAt`,`id`);--> statement-breakpoint
CREATE INDEX `supplierOrder_upstream_idx` ON `supplierOrder` (`selectedAccountId`,`upstreamOrderId`);--> statement-breakpoint
DROP TABLE `__backup_card`;--> statement-breakpoint
DROP TABLE `__backup_orderDelivery`;--> statement-breakpoint
DROP TABLE `__backup_paymentAttempt`;--> statement-breakpoint
DROP TABLE `__backup_paymentLog`;--> statement-breakpoint
DROP TABLE `__backup_automaticDeliveryJob`;--> statement-breakpoint
DROP TABLE `__backup_orderEvent`;--> statement-breakpoint
DROP TABLE `__backup_pushRetry`;--> statement-breakpoint
DROP TABLE `__backup_pushLog`;--> statement-breakpoint
DROP TABLE `__backup_supplierOrder`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint