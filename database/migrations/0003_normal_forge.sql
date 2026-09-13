PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
DROP TABLE `order`;--> statement-breakpoint
ALTER TABLE `__new_order` RENAME TO `order`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `order_orderNo_unique` ON `order` (`orderNo`);--> statement-breakpoint
CREATE INDEX `order_productId_idx` ON `order` (`productId`);--> statement-breakpoint
CREATE INDEX `order_ownerUserId_createdAt_idx` ON `order` (`ownerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_guestEmail_createdAt_idx` ON `order` (`contactEmailNormalized`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_status_createdAt_idx` ON `order` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_paymentStatus_createdAt_idx` ON `order` (`paymentStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_deliveryStatus_createdAt_idx` ON `order` (`deliveryStatus`,`createdAt`);