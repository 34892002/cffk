import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { adminProfile, emailLog, order, siteSetting, user } from "@/database/drizzle/schema";
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

type RecipientType = "CUSTOMER" | "ADMIN";

function isEmailAddress(value: string | null | undefined) {
  return /^\S+@\S+\.\S+$/.test(value?.trim() ?? "");
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount / 100);
}

async function hasSuccessfulDelivery(database: D1Database, orderId: number, scene: EmailScene, to: string) {
  const [record] = await createDrizzleDb(database)
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.orderId, orderId), eq(emailLog.scene, scene), eq(emailLog.toEmail, to), eq(emailLog.status, "SUCCESS")))
    .limit(1);
  return Boolean(record);
}

async function sendOnce(
  database: D1Database,
  runtime: EmailRuntime,
  record: OrderEmailRecord,
  scene: EmailScene,
  to: string,
  recipientType: RecipientType,
  variables: Record<string, string | number>,
) {
  const recipient = to.trim();
  if (!isEmailAddress(recipient) || await hasSuccessfulDelivery(database, record.id, scene, recipient)) return;
  await sendEmail(database, runtime, {
    scene,
    to: recipient,
    orderId: record.id,
    variables,
    recipientType,
    ...(recipientType === "ADMIN" ? { triggeredBy: "system:admin" } : {}),
  });
}

async function getActiveAdminEmails(database: D1Database) {
  const rows = await createDrizzleDb(database)
    .select({ email: user.email })
    .from(adminProfile)
    .innerJoin(user, eq(adminProfile.userId, user.id))
    .where(eq(adminProfile.status, "ACTIVE"));
  return rows.map((row) => row.email.trim()).filter(isEmailAddress);
}

async function sendToActiveAdmins(
  database: D1Database,
  runtime: EmailRuntime,
  record: OrderEmailRecord,
  scene: EmailScene,
  variables: Record<string, string | number>,
) {
  const emails = await getActiveAdminEmails(database);
  await Promise.all(emails.map((email) => sendOnce(database, runtime, record, scene, email, "ADMIN", variables).catch(() => undefined)));
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
  if (!record) return null;
  const [settings] = await db.select({ siteName: siteSetting.siteName, siteUrl: siteSetting.siteUrl, footerText: siteSetting.footerText, supportContact: siteSetting.supportContact }).from(siteSetting).where(eq(siteSetting.id, 1)).limit(1);
  const siteName = settings?.siteName || "CFFK";
  const queryUrl = settings?.siteUrl ? `${settings.siteUrl.replace(/\/$/, "")}/order` : "/order";
  return { record, common: { siteName, orderNo: record.orderNo, productName: record.productName, quantity: record.quantity, amount: formatAmount(record.amount), queryUrl, footerText: settings?.footerText || "", supportContact: settings?.supportContact || "" } };
}

async function notifyScene(
  database: D1Database,
  runtime: EmailRuntime,
  record: OrderEmailRecord,
  scene: EmailScene,
  variables: Record<string, string | number>,
) {
  const sends: Promise<void>[] = [sendToActiveAdmins(database, runtime, record, scene, variables)];
  const customerEmail = record.contactValue?.trim();
  if (record.contactType === "EMAIL" && customerEmail && isEmailAddress(customerEmail)) {
    sends.push(sendOnce(database, runtime, record, scene, customerEmail, "CUSTOMER", variables));
  }
  await Promise.all(sends.map((send) => send.catch(() => undefined)));
}

export async function notifyOrderEmailEvents(database: D1Database, runtime: EmailRuntime, orderId: number) {
  try {
    const context = await getOrderEmailContext(database, orderId);
    if (!context) return;
    const { record, common } = context;
    if (record.paymentStatus === "PAID") await notifyScene(database, runtime, record, "ORDER_PAID", common);
    if (record.deliveryStatus === "DELIVERED") {
      await notifyScene(database, runtime, record, "DELIVERY_SUCCESS", { ...common, deliveryItems: "请使用订单号和查询令牌在订单查询页查看交付内容。" });
    }
  } catch {
    // Notification failures never change payment or order state.
  }
}

export async function notifyOrderDeliveryFailure(database: D1Database, runtime: EmailRuntime, orderId: number, errorMessage: string) {
  try {
    const context = await getOrderEmailContext(database, orderId);
    if (!context) return;
    await notifyScene(database, runtime, context.record, "DELIVERY_FAILED", { ...context.common, errorMessage });
  } catch {
    // Delivery failure notices are best-effort and cannot affect the recorded order state.
  }
}
