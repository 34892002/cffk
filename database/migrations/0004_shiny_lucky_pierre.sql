ALTER TABLE `category` ADD `translationsJson` text;--> statement-breakpoint
ALTER TABLE `order` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `productSku` ADD `translationsJson` text;--> statement-breakpoint
ALTER TABLE `product_v2` ADD `translationsJson` text;--> statement-breakpoint
ALTER TABLE `siteSetting` ADD `translationsJson` text;
--> statement-breakpoint
UPDATE `emailTemplate`
SET `templateJson` = json_set(`templateJson`, '$.translations', json('{"zh-TW":{"subject":"[{{siteName}}] 驗證您的電子郵件","body":"請點擊以下連結驗證您的電子郵件：\n\n{{actionUrl}}\n\n如果這不是您的操作，請忽略此郵件。"},"en-US":{"subject":"[{{siteName}}] Verify your email","body":"Click the link below to verify your email address:\n\n{{actionUrl}}\n\nIf you did not request this, you can ignore this email."}}')),
    `updatedAt` = unixepoch('now') * 1000
WHERE `scene` = 'EMAIL_VERIFICATION' AND (CASE WHEN json_valid(`templateJson`) AND json_type(`templateJson`) = 'object' THEN json_extract(`templateJson`, '$.translations') IS NULL ELSE 0 END);
--> statement-breakpoint
UPDATE `emailTemplate`
SET `templateJson` = json_set(`templateJson`, '$.translations', json('{"zh-TW":{"subject":"[{{siteName}}] 重設您的密碼","body":"請點擊以下連結重設您的密碼：\n\n{{actionUrl}}\n\n如果這不是您的操作，請忽略此郵件。"},"en-US":{"subject":"[{{siteName}}] Reset your password","body":"Click the link below to reset your password:\n\n{{actionUrl}}\n\nIf you did not request this, you can ignore this email."}}')),
    `updatedAt` = unixepoch('now') * 1000
WHERE `scene` = 'PASSWORD_RESET' AND (CASE WHEN json_valid(`templateJson`) AND json_type(`templateJson`) = 'object' THEN json_extract(`templateJson`, '$.translations') IS NULL ELSE 0 END);
--> statement-breakpoint
UPDATE `emailTemplate`
SET `templateJson` = json_set(`templateJson`, '$.translations', json('{"zh-TW":{"subject":"訂單復原驗證碼","body":"您的訂單復原驗證碼是：{{code}}\n\n驗證碼將在 {{expiresMinutes}} 分鐘後失效。若非本人操作，請忽略此郵件。"},"en-US":{"subject":"Order recovery code","body":"Your order recovery code is: {{code}}\n\nThis code expires in {{expiresMinutes}} minutes. If you did not request it, you can ignore this email."}}')),
    `updatedAt` = unixepoch('now') * 1000
WHERE `scene` = 'GUEST_ORDER_RECOVERY' AND (CASE WHEN json_valid(`templateJson`) AND json_type(`templateJson`) = 'object' THEN json_extract(`templateJson`, '$.translations') IS NULL ELSE 0 END);
--> statement-breakpoint
UPDATE `emailTemplate`
SET `templateJson` = json_set(`templateJson`, '$.translations', json('{"zh-TW":{"subject":"[{{siteName}}] 訂單 {{orderNo}} 付款成功","body":"您的訂單已付款成功。\n\n訂單號碼：{{orderNo}}\n顧客電子郵件：{{contactEmail}}\n商品：{{productName}}\n金額：{{amount}}\n備註：{{buyerNote}}\n查詢位址：{{queryUrl}}\n\n{{footerText}}"},"en-US":{"subject":"[{{siteName}}] Order {{orderNo}} paid","body":"Your order has been paid successfully.\n\nOrder number: {{orderNo}}\nCustomer email: {{contactEmail}}\nProduct: {{productName}}\nAmount: {{amount}}\nNote: {{buyerNote}}\nOrder lookup: {{queryUrl}}\n\n{{footerText}}"}}')),
    `updatedAt` = unixepoch('now') * 1000
WHERE `scene` = 'ORDER_PAID' AND (CASE WHEN json_valid(`templateJson`) AND json_type(`templateJson`) = 'object' THEN json_extract(`templateJson`, '$.translations') IS NULL ELSE 0 END);
--> statement-breakpoint
UPDATE `emailTemplate`
SET `templateJson` = json_set(`templateJson`, '$.translations', json('{"zh-TW":{"subject":"[{{siteName}}] 訂單 {{orderNo}} 已出貨","body":"您的訂單已完成出貨。\n\n訂單號碼：{{orderNo}}\n顧客電子郵件：{{contactEmail}}\n商品：{{productName}}\n數量：{{quantity}}\n備註：{{buyerNote}}\n出貨內容：\n{{deliveryItems}}\n\n查詢位址：{{queryUrl}}\n客服聯絡方式：{{supportContact}}"},"en-US":{"subject":"[{{siteName}}] Order {{orderNo}} delivered","body":"Your order has been delivered.\n\nOrder number: {{orderNo}}\nCustomer email: {{contactEmail}}\nProduct: {{productName}}\nQuantity: {{quantity}}\nNote: {{buyerNote}}\nDelivery contents:\n{{deliveryItems}}\n\nOrder lookup: {{queryUrl}}\nSupport: {{supportContact}}"}}')),
    `updatedAt` = unixepoch('now') * 1000
WHERE `scene` = 'DELIVERY_SUCCESS' AND (CASE WHEN json_valid(`templateJson`) AND json_type(`templateJson`) = 'object' THEN json_extract(`templateJson`, '$.translations') IS NULL ELSE 0 END);
