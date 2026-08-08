import type { AlipayConfig, EmailProviderConfig, EmailTemplateConfig } from "@/lib/config-schemas";

// Persist these values with JSON.stringify() in D1. Payment credentials are
// entered by the administrator and are never returned to the browser.
export const alipayConfig = {
  schemaVersion: 1,
  modes: ["web", "face_to_face"],
  baseUrl: "https://openapi.alipay.com",
  appId: "2026xxxxxxxxxxxx",
  privateKey: "-----BEGIN PRIVATE KEY-----\n...",
  alipayPublicKey: "-----BEGIN PUBLIC KEY-----\n...",
  notifyUrl: "https://shop.example.com/api/payments/alipay/notify",
  returnUrl: "https://shop.example.com/payment-result",
} satisfies AlipayConfig;

export const smtpEmailConfig = {
  kind: "smtp",
  host: "smtp.example.com",
  port: 465,
  secure: true,
  username: "orders@example.com",
  password: { secret: "SMTP_PASSWORD" },
  from: "CFFK <orders@example.com>",
} satisfies EmailProviderConfig;

export const deliverySuccessTemplate = {
  subject: "{{siteName}} - Your order {{orderNo}} has been delivered",
  body: "Order: {{orderNo}}\nProduct: {{productName}}\nItems:\n{{items}}",
  format: "text",
  variables: ["siteName", "orderNo", "productName", "items"],
} satisfies EmailTemplateConfig;
