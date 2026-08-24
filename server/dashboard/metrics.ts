import { eq, gte, sql } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { card, order, productV2 } from "@/database/drizzle/schema";
import { getSiteSettings } from "@/server/site/public-settings";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { buildDashboardOrderTrend, dashboardTrendStart, type DashboardOrderTrendPoint } from "@/lib/dashboard-trend";

export type DashboardData = {
  metrics: {
    totalOrders: number;
    paidOrders: number;
    paidAmount: string;
    activeProducts: number;
    availableCards: number;
  };
  orderTrend: DashboardOrderTrendPoint[];
};

export async function getDashboardData(database: D1Database): Promise<DashboardData> {
  const db = createDrizzleDb(database);
  const settings = await getSiteSettings(database);
  const now = new Date();
  const trendStart = dashboardTrendStart(now, settings.timezone);

  const [orders, products, cards, trendOrders] = await Promise.all([
    db.select({
      totalOrders: sql<number>`count(*)`,
      paidOrders: sql<number>`sum(case when ${order.paymentStatus} = 'PAID' then 1 else 0 end)`,
      paidAmount: sql<number>`sum(case when ${order.paymentStatus} = 'PAID' then ${order.amount} else 0 end)`,
    }).from(order),
    db.select({ activeProducts: sql<number>`count(*)` }).from(productV2).where(eq(productV2.status, "ACTIVE")),
    db.select({ count: sql<number>`count(*)` }).from(card).where(eq(card.status, "UNUSED")),
    db
      .select({
        createdAt: order.createdAt,
        paymentStatus: order.paymentStatus,
      })
      .from(order)
      .where(gte(order.createdAt, trendStart)),
  ]);

  return {
    metrics: {
      totalOrders: orders[0]?.totalOrders ?? 0,
      paidOrders: orders[0]?.paidOrders ?? 0,
      paidAmount: formatCentsAsYuan(orders[0]?.paidAmount ?? 0),
      activeProducts: products[0]?.activeProducts ?? 0,
      availableCards: cards[0]?.count ?? 0,
    },
    orderTrend: buildDashboardOrderTrend(trendOrders, settings.timezone, now),
  };
}
