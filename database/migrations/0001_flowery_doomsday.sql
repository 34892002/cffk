PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `product_v2` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoryId` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`subtitle` text,
	`description` text,
	`coverImage` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`manualDeliveryHint` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`purchaseNote` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_v2_slug_unique` ON `product_v2` (`slug`);
--> statement-breakpoint
CREATE INDEX `product_v2_categoryId_idx` ON `product_v2` (`categoryId`);
--> statement-breakpoint
CREATE INDEX `product_v2_status_sort_idx` ON `product_v2` (`status`,`sort`);
--> statement-breakpoint
INSERT INTO `product_v2` (id, categoryId, name, slug, subtitle, description, coverImage, status, manualDeliveryHint, sort, purchaseNote, createdAt, updatedAt)
SELECT id, categoryId, name, slug, subtitle, description, coverImage, status, manualDeliveryHint, sort, purchaseNote, createdAt, updatedAt
FROM `product`;
--> statement-breakpoint
CREATE TABLE `productSku` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productId` integer NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`deliveryType` text NOT NULL,
	`fixedDeliveryContent` text,
	`physicalStock` integer,
	`minBuy` integer DEFAULT 1 NOT NULL,
	`maxBuy` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `product_v2`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productSku_product_name_unique` ON `productSku` (`productId`,`name`);
--> statement-breakpoint
CREATE INDEX `productSku_product_status_sort_idx` ON `productSku` (`productId`,`status`,`sort`);
--> statement-breakpoint
ALTER TABLE `card` ADD `productSkuId` integer REFERENCES productSku(id);
--> statement-breakpoint
ALTER TABLE `order` ADD `productSkuId` integer REFERENCES productSku(id);
--> statement-breakpoint
ALTER TABLE `order` ADD `productSkuNameSnapshot` text;
--> statement-breakpoint
INSERT INTO `productSku` (productId, name, price, status, deliveryType, fixedDeliveryContent, physicalStock, minBuy, maxBuy, sort, createdAt, updatedAt)
SELECT id, '默认规格', price, CASE WHEN status = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END, deliveryType, fixedDeliveryContent, physicalStock, minBuy, maxBuy, 0, createdAt, updatedAt
FROM `product`;
--> statement-breakpoint
UPDATE card SET productSkuId = (SELECT sku.id FROM productSku sku WHERE sku.productId = card.productId ORDER BY sku.sort, sku.id LIMIT 1) WHERE productSkuId IS NULL;
--> statement-breakpoint
UPDATE `order` SET productSkuId = (SELECT sku.id FROM productSku sku WHERE sku.productId = `order`.productId ORDER BY sku.sort, sku.id LIMIT 1), productSkuNameSnapshot = (SELECT sku.name FROM productSku sku WHERE sku.productId = `order`.productId ORDER BY sku.sort, sku.id LIMIT 1) WHERE productSkuId IS NULL;
--> statement-breakpoint
UPDATE productSku
SET physicalStock = physicalStock + (
  SELECT COALESCE(SUM(o.quantity), 0)
  FROM `order` o
  WHERE o.productSkuId = productSku.id
    AND o.status = 'PENDING'
    AND o.paymentStatus = 'UNPAID'
    AND o.physicalStockReserved = 1
),
updatedAt = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE physicalStock IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM `order` o
    WHERE o.productSkuId = productSku.id
      AND o.status = 'PENDING'
      AND o.paymentStatus = 'UNPAID'
      AND o.physicalStockReserved = 1
  );
--> statement-breakpoint
UPDATE discountCode
SET reservedCount = MAX(0, reservedCount - (
  SELECT COUNT(*)
  FROM `order` o
  WHERE o.discountCodeId = discountCode.id
    AND o.status = 'PENDING'
    AND o.paymentStatus = 'UNPAID'
)),
updatedAt = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE reservedCount > 0
  AND EXISTS (
    SELECT 1
    FROM `order` o
    WHERE o.discountCodeId = discountCode.id
      AND o.status = 'PENDING'
      AND o.paymentStatus = 'UNPAID'
  );
--> statement-breakpoint
UPDATE `order`
SET status = 'CLOSED',
    physicalStockReserved = 0,
    closedAt = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    updatedAt = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'PENDING'
  AND paymentStatus = 'UNPAID';
--> statement-breakpoint
CREATE TABLE `order_v2` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderNo` text NOT NULL,
	`ownerUserId` text,
	`productId` integer NOT NULL,
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
	FOREIGN KEY (`ownerUserId`) REFERENCES `user`(`id`),
	FOREIGN KEY (`productId`) REFERENCES `product_v2`(`id`),
	FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`),
	FOREIGN KEY (`discountCodeId`) REFERENCES `discountCode`(`id`) ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `order_v2` SELECT id, orderNo, ownerUserId, productId, productSkuId, productNameSnapshot, productSkuNameSnapshot, unitPrice, quantity, amount, contactType, contactValue, contactEmailNormalized, buyerNote, addressSnapshotJson, paymentProvider, paymentChannel, deliveryTypeSnapshot, fixedDeliveryContentSnapshot, physicalStockReserved, status, paymentStatus, deliveryStatus, deliveryToken, deliveryLeaseUntil, discountCodeId, discountCodeStr, originalAmount, discountAmount, paidAt, deliveredAt, closedAt, createdAt, updatedAt FROM `order`;
--> statement-breakpoint
DROP TABLE `order`;
--> statement-breakpoint
ALTER TABLE `order_v2` RENAME TO `order`;
--> statement-breakpoint
CREATE UNIQUE INDEX `order_orderNo_unique` ON `order` (`orderNo`);
--> statement-breakpoint
CREATE INDEX `order_productId_idx` ON `order` (`productId`);
--> statement-breakpoint
CREATE INDEX `order_ownerUserId_createdAt_idx` ON `order` (`ownerUserId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `order_guestEmail_createdAt_idx` ON `order` (`contactEmailNormalized`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `order_status_createdAt_idx` ON `order` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `order_paymentStatus_createdAt_idx` ON `order` (`paymentStatus`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `order_deliveryStatus_createdAt_idx` ON `order` (`deliveryStatus`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `card_v2` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productId` integer NOT NULL,
	`productSkuId` integer,
	`content` text NOT NULL,
	`status` text DEFAULT 'UNUSED' NOT NULL,
	`batchNo` text,
	`orderId` integer,
	`soldAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `product_v2`(`id`),
	FOREIGN KEY (`productSkuId`) REFERENCES `productSku`(`id`),
	FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `card_v2` SELECT id, productId, productSkuId, content, status, batchNo, orderId, soldAt, createdAt, updatedAt FROM `card`;
--> statement-breakpoint
DROP TABLE `card`;
--> statement-breakpoint
ALTER TABLE `card_v2` RENAME TO `card`;
--> statement-breakpoint
CREATE INDEX `card_product_status_idx` ON `card` (`productId`,`status`);
--> statement-breakpoint
CREATE INDEX `card_orderId_idx` ON `card` (`orderId`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
--> statement-breakpoint
DROP TABLE `product`;
--> statement-breakpoint
PRAGMA foreign_key_check;
