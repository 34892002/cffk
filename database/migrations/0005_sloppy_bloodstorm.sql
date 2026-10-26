ALTER TABLE `order` ADD `currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `order` ADD `exchangeRate` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `order` ADD `baseAmount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSetting` ADD `currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSetting` ADD `exchangeRate` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSetting` ADD `currencyUpdatedAt` integer;--> statement-breakpoint
ALTER TABLE `siteSetting` ADD `noticePopupEnabled` integer DEFAULT false NOT NULL;--> statement-breakpoint

-- Existing orders were always settled in CNY; keep their base amount equal to the charged amount.
UPDATE `order` SET `baseAmount` = `amount` WHERE `baseAmount` = 0;