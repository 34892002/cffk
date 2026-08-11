import { desc, eq, gte, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card, order, product } from "@/database/drizzle/schema";
import { getSiteSettings } from "@/server/site/public-settings";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { startOfDayInTimezone } from "@/lib/site-timezone";

export type DashboardData = {
  metrics: {
    totalOrders: number;
    paidOrders: number;
    paidAmount: string;
    activeProducts: number;
    availableCards: number;
  };
  recentOrders: Array<{
    id: number;
    orderNo: string;
    productName: string;
    amount: string;
    quantity: number;
    status: "PENDING" | "PAID" | "DELIVERED" | "CLOSED" | "FAILED";
    paymentStatus: "UNPAID" | "PAID" | "FAILED";
    deliveryStatus: "NOT_DELIVERED" | "DELIVERING" | "DELIVERED" | "FAILED";
    createdAt: Date;
  }>;
};

export async function getDashboardData(database: D1Database): Promise<DashboardData> {
  const db = createDrizzleDb(database);
  const settings = await getSiteSettings(database);
  const startOfToday = startOfDayInTimezone(new Date(), settings.timezone);

  const [orders, products, cards, recentOrders] = await Promise.all([
    db.select({
      totalOrders: sql<number>`count(*)`,
      paidOrders: sql<number>`sum(case when ${order.paymentStatus} = 'PAID' then 1 else 0 end)`,
      paidAmount: sql<number>`sum(case when ${order.paymentStatus} = 'PAID' then ${order.amount} else 0 end)`,
    }).from(order),
    db.select({ activeProducts: sql<number>`count(*)` }).from(product).where(eq(product.status, "ACTIVE")),
    db.select({ count: sql<number>`count(*)` }).from(card).where(eq(card.status, "UNUSED")),
    db
      .select({
        id: order.id,
        orderNo: order.orderNo,
        productName: order.productNameSnapshot,
        amount: order.amount,
        quantity: order.quantity,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        createdAt: order.createdAt,
      })
      .from(order)
      .where(gte(order.createdAt, startOfToday))
      .orderBy(desc(order.id))
      .limit(10),
  ]);

  return {
    metrics: {
      totalOrders: orders[0]?.totalOrders ?? 0,
      paidOrders: orders[0]?.paidOrders ?? 0,
      paidAmount: formatCentsAsYuan(orders[0]?.paidAmount ?? 0),
      activeProducts: products[0]?.activeProducts ?? 0,
      availableCards: cards[0]?.count ?? 0,
    },
    recentOrders: recentOrders.map((record) => ({ ...record, amount: formatCentsAsYuan(record.amount) })),
  };
}
