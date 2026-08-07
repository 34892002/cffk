CREATE TABLE `pushConfig` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`isEnabled` integer DEFAULT true NOT NULL,
	`emailEnabled` integer DEFAULT true NOT NULL,
	`wecomEnabled` integer DEFAULT false NOT NULL,
	`telegramEnabled` integer DEFAULT false NOT NULL,
	`customerOrderPaid` integer DEFAULT true NOT NULL,
	`customerDeliverySuccess` integer DEFAULT true NOT NULL,
	`customerDeliveryFailed` integer DEFAULT false NOT NULL,
	`adminOrderPaid` integer DEFAULT false NOT NULL,
	`adminDeliverySuccess` integer DEFAULT true NOT NULL,
	`adminDeliveryFailed` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pushLog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderId` integer,
	`channel` text NOT NULL,
	`provider` text NOT NULL,
	`scene` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text,
	`status` text NOT NULL,
	`messageId` text,
	`error` text,
	`triggeredBy` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pushLog_channel_createdAt_idx` ON `pushLog` (`channel`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pushLog_status_createdAt_idx` ON `pushLog` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pushLog_orderId_idx` ON `pushLog` (`orderId`);
--> statement-breakpoint
INSERT INTO `pushConfig` (
  `id`, `isEnabled`, `emailEnabled`, `wecomEnabled`, `telegramEnabled`,
  `customerOrderPaid`, `customerDeliverySuccess`, `customerDeliveryFailed`,
  `adminOrderPaid`, `adminDeliverySuccess`, `adminDeliveryFailed`,
  `createdAt`, `updatedAt`
) VALUES (1, true, true, false, false, true, true, false, false, true, true, unixepoch() * 1000, unixepoch() * 1000);
--> statement-breakpoint
INSERT INTO `pushLog` (
  `orderId`, `channel`, `provider`, `scene`, `recipient`, `subject`, `status`, `messageId`, `error`, `triggeredBy`, `createdAt`
)
SELECT `orderId`, 'EMAIL', `provider`, `scene`, `toEmail`, `subject`, `status`, `messageId`, `error`, `triggeredBy`, `createdAt`
FROM `emailLog`;