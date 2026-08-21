CREATE TABLE `productSku` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productId` integer NOT NULL,
	`name` text DEFAULT '默认规格' NOT NULL,
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
	FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productSku_product_name_unique` ON `productSku` (`productId`,`name`);--> statement-breakpoint
CREATE INDEX `productSku_product_status_sort_idx` ON `productSku` (`productId`,`status`,`sort`);--> statement-breakpoint
ALTER TABLE `card` ADD `productSkuId` integer REFERENCES productSku(id);--> statement-breakpoint
ALTER TABLE `order` ADD `productSkuId` integer REFERENCES productSku(id);--> statement-breakpoint
ALTER TABLE `order` ADD `productSkuNameSnapshot` text;--> statement-breakpoint
INSERT INTO `productSku` (productId, name, price, status, deliveryType, fixedDeliveryContent, physicalStock, minBuy, maxBuy, sort, createdAt, updatedAt)
SELECT id, '默认规格', price, CASE WHEN status = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END, deliveryType, fixedDeliveryContent, physicalStock, minBuy, maxBuy, 0, createdAt, updatedAt FROM product
WHERE NOT EXISTS (SELECT 1 FROM productSku sku WHERE sku.productId = product.id);--> statement-breakpoint
UPDATE card SET productSkuId = (SELECT sku.id FROM productSku sku WHERE sku.productId = card.productId ORDER BY sku.sort, sku.id LIMIT 1) WHERE productSkuId IS NULL;--> statement-breakpoint
UPDATE `order` SET productSkuId = (SELECT sku.id FROM productSku sku WHERE sku.productId = `order`.productId ORDER BY sku.sort, sku.id LIMIT 1), productSkuNameSnapshot = (SELECT sku.name FROM productSku sku WHERE sku.productId = `order`.productId ORDER BY sku.sort, sku.id LIMIT 1) WHERE productSkuId IS NULL;--> statement-breakpoint
CREATE TABLE `product_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoryId` integer REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
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
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `product_new` (id, categoryId, name, slug, subtitle, description, coverImage, status, manualDeliveryHint, sort, purchaseNote, createdAt, updatedAt) SELECT id, categoryId, name, slug, subtitle, description, coverImage, status, manualDeliveryHint, sort, purchaseNote, createdAt, updatedAt FROM product;--> statement-breakpoint
DROP TABLE `product`;--> statement-breakpoint
ALTER TABLE `product_new` RENAME TO `product`;--> statement-breakpoint
CREATE UNIQUE INDEX `product_slug_unique` ON `product` (`slug`);--> statement-breakpoint
CREATE INDEX `product_categoryId_idx` ON `product` (`categoryId`);--> statement-breakpoint
CREATE INDEX `product_status_sort_idx` ON `product` (`status`,`sort`);