import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { emailLog, order, siteSetting } from "@/database/drizzle/schema";
import { sendEmail, type EmailScene } from "./service";

type EmailRuntime = Record<string, unknown>;

type OrderEmailRecord = {
  id: number;
  orderNo: string;
  queryToken: string;
  productName: string;
  quantity: number;
  amount: number;
  contactType: "EMAIL" | "QQ" | "TELEGRAM" | "OTHER";
  contactValue: string | null;
  paymentStatus: "UNPAID" | "PAID" | "FAILED";
  deliveryStatus: "NOT_DELIVERED" | "DELIVERED" | "FAILED";
};

function isEmailContact(record: OrderEmailRecord) {
  return record.contactType === "EMAIL" && /^\S+@\S+\.\S+$/.test(record.contactValue?.trim() ?? "");
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100);
}

async function hasSuccessfulDelivery(database: D1Database, orderId: number, scene: EmailScene) {
  const [record] = await createDrizzleDb(database)
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.orderId, orderId), eq(emailLog.scene, scene), eq(emailLog.status, "SUCCESS")))
    .limit(1);
  return Boolean(record);
}

async function sendOnce(database: D1Database, runtime: EmailRuntime, record: OrderEmailRecord, scene: EmailScene, variables: Record<string, string | number>) {
  if (await hasSuccessfulDelivery(database, record.id, scene)) return;
  await sendEmail(database, runtime, { scene, to: record.contactValue!, orderId: record.id, variables });
}

async function getOrderEmailContext(database: D1Database, orderId: number) {
  const db = createDrizzleDb(database);
  const [record] = await db
    .select({
      id: order.id,
      orderNo: order.orderNo,
      queryToken: order.queryToken,
      productName: order.productNameSnapshot,
      quantity: order.quantity,
      amount: order.amount,
      contactType: order.contactType,
      contactValue: order.contactValue,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
    })
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1);
  if (!record || !isEmailContact(record)) return null;
  const [settings] = await db.select({ siteName: siteSetting.siteName, siteUrl: siteSetting.siteUrl, footerText: siteSetting.footerText, supportContact: siteSetting.supportContact }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  const siteName = settings?.siteName || "CFFK";
  const queryUrl = settings?.siteUrl ? `${settings.siteUrl.replace(/\/$/, "")}/order` : "/order";
  return { record, common: { siteName, orderNo: record.orderNo, productName: record.productName, quantity: record.quantity, amount: formatAmount(record.amount), queryUrl, footerText: settings?.footerText || "", supportContact: settings?.supportContact || "" } };
}

export async function notifyOrderEmailEvents(database: D1Database, runtime: EmailRuntime, orderId: number) {
  try {
    const context = await getOrderEmailContext(database, orderId);
    if (!context) return;
    const { record, common } = context;
    if (record.paymentStatus === "PAID") await sendOnce(database, runtime, record, "ORDER_PAID", common);
    if (record.deliveryStatus === "DELIVERED") await sendOnce(database, runtime, record, "DELIVERY_SUCCESS", { ...common, deliveryItems: "请使用订单号和查询令牌在订单查询页查看交付内容。" });
  } catch {
    // sendEmail records expected delivery failures. Notification failures never change payment or order state.
  }
}

export async function notifyOrderDeliveryFailure(database: D1Database, runtime: EmailRuntime, orderId: number, errorMessage: string) {
  try {
    const context = await getOrderEmailContext(database, orderId);
    if (!context) return;
    await sendOnce(database, runtime, context.record, "DELIVERY_FAILED", { ...context.common, errorMessage });
  } catch {
    // Delivery failure notices are best-effort and cannot affect the recorded order state.
  }
}
