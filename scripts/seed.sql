-- Initial business data for a fresh CFFK installation.
-- Every statement is idempotent: it never replaces administrator or operator configuration.
-- Secrets are not stored here. Set them with `wrangler secret put <NAME>` and
-- reference their binding names in the JSON configuration records.

INSERT INTO `siteSetting` (
  `id`, `siteName`, `siteSubtitle`, `notice`, `timezone`, `createdAt`, `updatedAt`
) VALUES (
  1,
  'CFFK',
  'Cloudflare Workers powered digital goods store',
  'Welcome to CFFK.',
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

-- One Alipay provider supports browser/H5 and face-to-face payment through
-- configJson.mode. Add credentials through Worker Secrets before enabling it.
INSERT INTO `paymentProvider` (
  `provider`, `name`, `isEnabled`, `configJson`, `createdAt`, `updatedAt`
) VALUES (
  'ALIPAY',
  'Alipay',
  false,
  '{"mode":"web","appId":"","privateKey":{"secret":"ALIPAY_PRIVATE_KEY"},"alipayPublicKey":{"secret":"ALIPAY_PUBLIC_KEY"}}',
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
) ON CONFLICT(`provider`) DO NOTHING;

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

-- S3-compatible storage remains disabled until its Worker Secrets are configured.
INSERT INTO `s3Config` (
  `id`, `configJson`, `createdAt`, `updatedAt`
) VALUES (
  1,
  '{"endpoint":"https://s3.example.com","region":"auto","bucket":"cffk-media","accessKeyId":{"secret":"S3_ACCESS_KEY_ID"},"secretAccessKey":{"secret":"S3_SECRET_ACCESS_KEY"},"publicBaseUrl":"https://cdn.example.com","forcePathStyle":false}',
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
) ON CONFLICT(`id`) DO NOTHING;

INSERT INTO `emailTemplate` (
  `scene`, `name`, `templateJson`, `createdAt`, `updatedAt`
) VALUES
  (
    'TEST',
    '测试邮件',
    '{"subject":"[{{siteName}}] 测试邮件","body":"这是一封测试邮件。\\n\\n站点：{{siteName}}\\n发送时间：{{sentAt}}\\n\\n{{customContent}}","format":"text","variables":["siteName","sentAt","customContent"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'ORDER_PAID',
    '支付成功通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 支付成功","body":"您的订单已支付成功。\\n\\n订单号：{{orderNo}}\\n顾客邮箱：{{contactEmail}}\\n商品：{{productName}}\\n金额：{{amount}}\\n备注：{{buyerNote}}\\n查询地址：{{queryUrl}}\\n\\n{{footerText}}","format":"text","variables":["siteName","orderNo","contactEmail","productName","amount","buyerNote","queryUrl","footerText"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'DELIVERY_SUCCESS',
    '发货成功通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 已发货","body":"您的订单已完成发货。\\n\\n订单号：{{orderNo}}\\n顾客邮箱：{{contactEmail}}\\n商品：{{productName}}\\n数量：{{quantity}}\\n备注：{{buyerNote}}\\n\\n查询地址：{{queryUrl}}\\n客服联系方式：{{supportContact}}","format":"text","variables":["siteName","orderNo","contactEmail","productName","quantity","buyerNote","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'DELIVERY_FAILED',
    '发货失败通知',
    '{"subject":"[{{siteName}}] 订单 {{orderNo}} 发货失败","body":"订单发货失败，请尽快处理。\\n\\n订单号：{{orderNo}}\\n顾客邮箱：{{contactEmail}}\\n商品：{{productName}}\\n备注：{{buyerNote}}\\n失败原因：{{errorMessage}}\\n\\n查询地址：{{queryUrl}}\\n客服联系方式：{{supportContact}}","format":"text","variables":["siteName","orderNo","contactEmail","productName","buyerNote","errorMessage","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  )
ON CONFLICT(`scene`) DO NOTHING;
