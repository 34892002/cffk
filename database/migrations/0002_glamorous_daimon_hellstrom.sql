ALTER TABLE `productSku` ADD COLUMN `fulfillmentSource` text DEFAULT 'LOCAL' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order` ADD COLUMN `fulfillmentSourceSnapshot` text DEFAULT 'LOCAL' NOT NULL;
--> statement-breakpoint
CREATE TABLE `supplierAccount` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`baseUrl` text NOT NULL,
	`normalizedApiOrigin` text NOT NULL,
	`protocolVersion` text NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`currencyDecimals` integer DEFAULT 2 NOT NULL,
	`credentialsJson` text NOT NULL,
	`credentialsRevision` integer DEFAULT 1 NOT NULL,
	`balanceMinor` text,
	`balanceSyncedAt` integer,
	`reserveBalanceMinor` text DEFAULT '0' NOT NULL,
	`lowBalanceMinor` text DEFAULT '0' NOT NULL,
	`maxOrderCostMinor` text,
	`healthStatus` text DEFAULT 'unknown' NOT NULL,
	`consecutiveFailures` integer DEFAULT 0 NOT NULL,
	`cooldownUntil` integer,
	`lastSelectedAt` integer,
	`lastErrorCode` text,
	`lastErrorAt` integer,
	`enabled` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplierAccount_source_name_unique` ON `supplierAccount` (`provider`,`normalizedApiOrigin`,`protocolVersion`,`name`);--> statement-breakpoint
CREATE INDEX `supplierAccount_eligible_idx` ON `supplierAccount` (`provider`,`normalizedApiOrigin`,`enabled`,`healthStatus`,`cooldownUntil`,`lastSelectedAt`);--> statement-breakpoint
CREATE INDEX `supplierAccount_updatedAt_idx` ON `supplierAccount` (`updatedAt`);--> statement-breakpoint
CREATE TABLE `supplierBinding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productSkuId` integer NOT NULL,
	`provider` text NOT NULL,
	`normalizedApiOrigin` text NOT NULL,
	`protocolVersion` text NOT NULL,
	`upstreamProductId` text NOT NULL,
	`upstreamSkuId` text NOT NULL,
	`upstreamProductName` text NOT NULL,
	`upstreamSkuName` text NOT NULL,
	`purchaseContextJson` text,
	`referenceCostMinor` text NOT NULL,
	`maxCostMinor` text NOT NULL,
	`stockQuantity` integer DEFAULT 0 NOT NULL,
	`remoteStatus` text DEFAULT 'unknown' NOT NULL,
	`lastSyncedAt` integer,
	`lastErrorCode` text,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplierBinding_sku_enabled_unique` ON `supplierBinding` (`productSkuId`) WHERE "supplierBinding"."enabled" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `supplierBinding_source_sku_unique` ON `supplierBinding` (`provider`,`normalizedApiOrigin`,`protocolVersion`,`upstreamProductId`,`upstreamSkuId`) WHERE "supplierBinding"."enabled" = 1;--> statement-breakpoint
CREATE INDEX `supplierBinding_sync_idx` ON `supplierBinding` (`provider`,`normalizedApiOrigin`,`enabled`,`remoteStatus`,`lastSyncedAt`);--> statement-breakpoint
CREATE TABLE `supplierOrder` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderId` integer NOT NULL,
	`productSkuId` integer NOT NULL,
	`supplierBindingId` integer NOT NULL,
	`deliveryRecordId` integer,
	`selectedAccountId` text,
	`selectedCredentialsRevision` integer,
	`providerRequestNo` text,
	`upstreamOrderId` text,
	`quantity` integer NOT NULL,
	`quotedUnitCostMinor` text,
	`totalCostMinor` text,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`bindingSnapshotJson` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attemptCount` integer DEFAULT 0 NOT NULL,
	`selectionCount` integer DEFAULT 0 NOT NULL,
	`accountLockedAt` integer,
	`nextRetryAt` integer,
	`lastErrorCode` text,
	`lastErrorMessage` text,
	`submittedAt` integer,
	`suppliedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplierBindingId`) REFERENCES `supplierBinding`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deliveryRecordId`) REFERENCES `orderDelivery`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`selectedAccountId`) REFERENCES `supplierAccount`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplierOrder_order_unique` ON `supplierOrder` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `supplierOrder_account_request_unique` ON `supplierOrder` (`selectedAccountId`,`providerRequestNo`);--> statement-breakpoint
CREATE INDEX `supplierOrder_state_retry_idx` ON `supplierOrder` (`state`,`nextRetryAt`,`id`);--> statement-breakpoint
CREATE INDEX `supplierOrder_upstream_idx` ON `supplierOrder` (`selectedAccountId`,`upstreamOrderId`);--> statement-breakpoint
CREATE TABLE `supplierSyncSettings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`intervalMs` integer DEFAULT 3600000 NOT NULL,
	`lastStartedAt` integer,
	`lastCompletedAt` integer,
	`lastStatus` text DEFAULT 'idle' NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
