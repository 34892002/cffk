import type { PushScene } from "@/server/push/types";

export type EmailTemplateDefinition = {
  scene: PushScene;
  title: string;
  description: string;
  variables: Array<{ key: string; label: string; example: string }>;
};

export const emailTemplateDefinitions: readonly EmailTemplateDefinition[] = [
  {
    scene: "TEST",
    title: "测试邮件",
    description: "管理员从通道配置页发送测试邮件时使用。",
    variables: [
      { key: "siteName", label: "站点名称", example: "CFFK" },
      { key: "sentAt", label: "发送时间", example: "2026年8月8日 12:00" },
      { key: "customContent", label: "测试内容", example: "这是一封测试邮件。" },
    ],
  },
  {
    scene: "ORDER_PAID",
    title: "订单支付成功",
    description: "订单完成支付后发送给客户和管理员。",
    variables: [
      { key: "siteName", label: "站点名称", example: "CFFK" },
      { key: "orderNo", label: "订单号", example: "CFFK202608080001" },
      { key: "contactEmail", label: "顾客邮箱", example: "buyer@example.com" },
      { key: "productName", label: "商品名称", example: "示例商品" },
      { key: "buyerNote", label: "买家备注", example: "请尽快发货。" },
      { key: "quantity", label: "购买数量", example: "1" },
      { key: "amount", label: "订单金额", example: "¥12.00" },
      { key: "queryUrl", label: "订单查询地址", example: "https://example.com/order?orderNo=CFFK202608080001&token=query-token" },
      { key: "footerText", label: "页脚文本", example: "感谢您的购买。" },
      { key: "supportContact", label: "客服联系方式", example: "support@example.com" },
    ],
  },
  {
    scene: "DELIVERY_SUCCESS",
    title: "订单发货成功",
    description: "订单自动或人工发货完成后发送给客户和管理员。",
    variables: [
      { key: "siteName", label: "站点名称", example: "CFFK" },
      { key: "orderNo", label: "订单号", example: "CFFK202608080001" },
      { key: "contactEmail", label: "顾客邮箱", example: "buyer@example.com" },
      { key: "productName", label: "商品名称", example: "示例商品" },
      { key: "quantity", label: "购买数量", example: "1" },
      { key: "buyerNote", label: "买家备注", example: "请尽快发货。" },
      { key: "deliveryItems", label: "发货内容", example: "CARD-KEY-123456" },
      { key: "queryUrl", label: "订单查询地址", example: "https://example.com/order?orderNo=CFFK202608080001&token=query-token" },
      { key: "footerText", label: "页脚文本", example: "感谢您的购买。" },
      { key: "supportContact", label: "客服联系方式", example: "support@example.com" },
    ],
  },
  {
    scene: "DELIVERY_FAILED",
    title: "订单发货失败",
    description: "订单发货失败、需要处理时发送给管理员。",
    variables: [
      { key: "siteName", label: "站点名称", example: "CFFK" },
      { key: "orderNo", label: "订单号", example: "CFFK202608080001" },
      { key: "contactEmail", label: "顾客邮箱", example: "buyer@example.com" },
      { key: "productName", label: "商品名称", example: "示例商品" },
      { key: "buyerNote", label: "买家备注", example: "请尽快发货。" },
      { key: "quantity", label: "购买数量", example: "1" },
      { key: "amount", label: "订单金额", example: "¥12.00" },
      { key: "errorMessage", label: "失败原因", example: "库存不足，请人工处理。" },
      { key: "queryUrl", label: "订单查询地址", example: "https://example.com/order?orderNo=CFFK202608080001&token=query-token" },
      { key: "footerText", label: "页脚文本", example: "请及时处理此订单。" },
      { key: "supportContact", label: "客服联系方式", example: "support@example.com" },
    ],
  },
  {
    scene: "PAYMENT_EXCEPTION",
    title: "订单支付异常",
    description: "订单关闭后到账或收到重复付款时发送给管理员。",
    variables: [
      { key: "siteName", label: "站点名称", example: "CFFK" },
      { key: "orderNo", label: "订单号", example: "CFFK202608080001" },
      { key: "contactEmail", label: "顾客邮箱", example: "buyer@example.com" },
      { key: "productName", label: "商品名称", example: "示例商品" },
      { key: "quantity", label: "购买数量", example: "1" },
      { key: "amount", label: "订单金额", example: "¥12.00" },
      { key: "errorMessage", label: "异常原因", example: "订单关闭后收到付款，请人工退款或处理。" },
      { key: "queryUrl", label: "订单查询地址", example: "https://example.com/order?orderNo=CFFK202608080001&token=query-token" },
      { key: "footerText", label: "页脚文本", example: "请及时核对支付流水。" },
      { key: "supportContact", label: "客服联系方式", example: "support@example.com" },
    ],
  },
];

export function getEmailTemplateDefinition(scene: PushScene) {
  const definition = emailTemplateDefinitions.find((item) => item.scene === scene);
  if (!definition) throw new Error("EMAIL_TEMPLATE_SCENE_INVALID");
  return definition;
}
