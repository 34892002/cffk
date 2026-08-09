CREATE TABLE `twoFactor` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`secret` text NOT NULL,
	`backupCodes` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`failedVerificationCount` integer DEFAULT 0 NOT NULL,
	`lockedUntil` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `twoFactor_userId_unique` ON `twoFactor` (`userId`);--> statement-breakpoint
ALTER TABLE `user` ADD `twoFactorEnabled` integer DEFAULT false NOT NULL;