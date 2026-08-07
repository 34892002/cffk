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

INSERT INTO `emailProvider` (
  `provider`, `name`, `isEnabled`, `configJson`, `createdAt`, `updatedAt`
) VALUES (
  'CLOUDFLARE',
  'Cloudflare Email Sending',
  false,
  '{"kind":"cloudflare","binding":"EMAIL","from":"orders@example.com"}',
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
) ON CONFLICT(`provider`) DO NOTHING;

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
  `scene`, `name`, `isEnabled`, `templateJson`, `createdAt`, `updatedAt`
) VALUES
  (
    'TEST',
    'Test email',
    true,
    '{"subject":"[{{siteName}}] Test email","body":"Site: {{siteName}}\\nSent at: {{sentAt}}\\n\\n{{customContent}}","format":"text","variables":["siteName","sentAt","customContent"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'ORDER_PAID',
    'Payment received',
    true,
    '{"subject":"[{{siteName}}] Order {{orderNo}} paid","body":"Your order has been paid.\\n\\nOrder: {{orderNo}}\\nProduct: {{productName}}\\nAmount: {{amount}}\\nQuery: {{queryUrl}}\\n\\n{{footerText}}","format":"text","variables":["siteName","orderNo","productName","amount","queryUrl","footerText"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'DELIVERY_SUCCESS',
    'Delivery successful',
    true,
    '{"subject":"[{{siteName}}] Order {{orderNo}} delivered","body":"Your order has been delivered.\\n\\nOrder: {{orderNo}}\\nProduct: {{productName}}\\nQuantity: {{quantity}}\\nItems:\\n{{deliveryItems}}\\n\\nQuery: {{queryUrl}}\\nSupport: {{supportContact}}","format":"text","variables":["siteName","orderNo","productName","quantity","deliveryItems","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  ),
  (
    'DELIVERY_FAILED',
    'Delivery failed',
    true,
    '{"subject":"[{{siteName}}] Order {{orderNo}} delivery failed","body":"Order delivery failed and requires attention.\\n\\nOrder: {{orderNo}}\\nProduct: {{productName}}\\nReason: {{errorMessage}}\\n\\nQuery: {{queryUrl}}\\nSupport: {{supportContact}}","format":"text","variables":["siteName","orderNo","productName","errorMessage","queryUrl","supportContact"]}',
    unixepoch('now') * 1000,
    unixepoch('now') * 1000
  )
ON CONFLICT(`scene`) DO NOTHING;
