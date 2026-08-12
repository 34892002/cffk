-- Initial business data for a fresh CFFK installation.
-- Every statement is idempotent: it never replaces administrator or operator configuration.
-- Payment configuration, including credential values, is stored directly in D1 configJson.
-- Seed values are placeholders and providers remain disabled until configured.

INSERT INTO `siteSetting` (
  `id`, `siteName`, `siteSubtitle`, `notice`, `timezone`, `createdAt`, `updatedAt`
) VALUES (
  1,
  'CFFK-Shop',
  '全球部署 一触即达',
  '为数字虚拟商品 量身打造的自动寄售平台',
  'Asia/Shanghai',
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
) ON CONFLICT(`id`) DO NOTHING;

-- Every product belongs to an active category. This is the fallback category
-- used until the operator creates more specific categories.
INSERT INTO `category` (
  `name`, `slug`, `description`, `sort`, `status`, `createdAt`, `updatedAt`
) VALUES (
  '默认分类',
  'default',
  '未指定分类的商品会归入这里。',
  0,
  'ACTIVE',
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
) ON CONFLICT(`slug`) DO NOTHING;

-- Repair products created before the fallback category was initialized.
UPDATE `product`
SET `categoryId` = (SELECT `id` FROM `category` WHERE `slug` = 'default')
WHERE `categoryId` IS NULL;

INSERT INTO `paymentProvider` (
  `provider`, `name`, `isEnabled`, `sort`, `configJson`, `createdAt`, `updatedAt`
) VALUES
  ('ALIPAY', '支付宝', false, 10, '{"schemaVersion":1,"modes":["web","face_to_face"],"baseUrl":"https://openapi.alipay.com","appId":"","sellerId":"","privateKey":"","alipayPublicKey":"","notifyUrl":"","returnUrl":""}', unixepoch('now') * 1000, unixepoch('now') * 1000),
  ('EPAY', '易支付', false, 20, '{"schemaVersion":1,"baseUrl":"","pid":"","key":"","epayChannels":["alipay","wxpay"],"notifyUrl":"","returnUrl":""}', unixepoch('now') * 1000, unixepoch('now') * 1000),
  ('BEPUSDT', 'BEpusdt', false, 30, '{"schemaVersion":1,"baseUrl":"","appSecret":"","notifyUrl":"","returnUrl":""}', unixepoch('now') * 1000, unixepoch('now') * 1000),
  ('STRIPE', 'Stripe', false, 40, '{"schemaVersion":1,"secretKey":"","webhookSecret":"","currency":"cny","notifyUrl":"","returnUrl":""}', unixepoch('now') * 1000, unixepoch('now') * 1000),
  ('HASHPAY', 'HashPay', false, 50, '{"schemaVersion":1,"baseUrl":"","merchantId":"","privateKey":"","currency":"CNY","notifyUrl":"","returnUrl":""}', unixepoch('now') * 1000, unixepoch('now') * 1000)
ON CONFLICT(`provider`) DO NOTHING;

INSERT INTO `pushChannelConfig` (
  `channel`, `provider`, `name`, `isEnabled`, `configJson`, `createdAt`, `updatedAt`
)
SELECT 'EMAIL', 'API', 'Brevo API', false, '{"schemaVersion":1,"kind":"api","apiProvider":"BREVO","endpoint":"https://api.brevo.com/v3/smtp/email","apiKey":{"secret":"BREVO_API_KEY"},"from":"orders@example.com"}', unixepoch('now') * 1000, unixepoch('now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM `pushChannelConfig` WHERE `channel` = 'EMAIL' AND `provider` = 'API' AND `name` = 'Brevo API');

INSERT INTO `pushChannelConfig` (
  `channel`, `provider`, `name`, `isEnabled`, `configJson`, `createdAt`, `updatedAt`
)
SELECT 'EMAIL', 'SMTP', 'SMTP 邮局', false, '{"schemaVersion":1,"kind":"smtp","host":"smtp.example.com","port":587,"secure":false,"authType":"plain","username":"","password":{"secret":"SMTP_PASSWORD"},"from":"orders@example.com"}', unixepoch('now') * 1000, unixepoch('now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM `pushChannelConfig` WHERE `channel` = 'EMAIL' AND `provider` = 'SMTP' AND `name` = 'SMTP 邮局');

INSERT INTO `pushChannelConfig` (
  `channel`, `provider`, `name`, `isEnabled`, `configJson`, `createdAt`, `updatedAt`
)
SELECT 'EMAIL', 'CLOUDFLARE', 'Cloudflare Email Sending', false, '{"schemaVersion":1,"kind":"cloudflare","binding":"EMAIL","from":"orders@example.com"}', unixepoch('now') * 1000, unixepoch('now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM `pushChannelConfig` WHERE `channel` = 'EMAIL' AND `provider` = 'CLOUDFLARE' AND `name` = 'Cloudflare Email Sending');

INSERT INTO `emailTemplate` (
  `scene`, `name`, `templateJson`, `createdAt`, `updatedAt`
) VALUES
  (
    'TEST',
    '测试邮件',
    '{"subject":"[{{siteName}}] 测试邮件","body":"这是一封测试邮件。\n\n站点：{{siteName}}\n发送时间：{{sentAt}}\n\n{{customContent}}","format":"text","variables":["siteName","sentAt","customContent"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'ORDER_PAID',
    '支付成功通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 支付成功","body":"您的订单已支付成功。\n\n订单号：{{orderNo}}\n顾客邮箱：{{contactEmail}}\n商品：{{productName}}\n金额：{{amount}}\n备注：{{buyerNote}}\n查询地址：{{queryUrl}}\n\n{{footerText}}","format":"text","variables":["siteName","orderNo","contactEmail","productName","amount","buyerNote","queryUrl","footerText"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'DELIVERY_SUCCESS',
    '发货成功通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 已发货","body":"您的订单已完成发货。\n\n订单号：{{orderNo}}\n顾客邮箱：{{contactEmail}}\n商品：{{productName}}\n数量：{{quantity}}\n备注：{{buyerNote}}\n发货内容：\n{{deliveryItems}}\n\n查询地址：{{queryUrl}}\n客服联系方式：{{supportContact}}","format":"text","variables":["siteName","orderNo","contactEmail","productName","quantity","buyerNote","deliveryItems","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'DELIVERY_FAILED',
    '发货失败通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 发货失败","body":"订单发货失败，请尽快处理。\n\n订单号：{{orderNo}}\n顾客邮箱：{{contactEmail}}\n商品：{{productName}}\n备注：{{buyerNote}}\n失败原因：{{errorMessage}}\n\n查询地址：{{queryUrl}}\n客服联系方式：{{supportContact}}","format":"text","variables":["siteName","orderNo","contactEmail","productName","buyerNote","errorMessage","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'PAYMENT_EXCEPTION',
    '支付异常通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 支付异常","body":"订单出现支付异常，请及时处理。\n\n订单号：{{orderNo}}\n商品：{{productName}}\n金额：{{amount}}\n异常原因：{{errorMessage}}\n\n查询地址：{{queryUrl}}\n客服联系方式：{{supportContact}}","format":"text","variables":["siteName","orderNo","productName","amount","errorMessage","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  )
ON CONFLICT(`scene`) DO NOTHING;
