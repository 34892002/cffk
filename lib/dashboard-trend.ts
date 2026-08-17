import { dateBoundaryInTimezone, formatDateInTimezone } from "@/lib/site-timezone";

export type DashboardTrendRange = 7 | 30 | 90;

export type DashboardOrderTrendPoint = {
  date: string;
  timestamp: number;
  createdOrders: number;
  paidOrders: number;
};

type OrderTrendRecord = {
  createdAt: Date;
  paymentStatus: "UNPAID" | "PAID" | "FAILED";
};

function dateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

export function dashboardTrendStart(now: Date, timezone: string, days: DashboardTrendRange = 90) {
  return dateBoundaryInTimezone(shiftDateKey(dateKey(now, timezone), -(days - 1)), timezone);
}

export function buildDashboardOrderTrend(
  records: OrderTrendRecord[],
  timezone: string,
  now = new Date(),
  days: DashboardTrendRange = 90,
): DashboardOrderTrendPoint[] {
  const today = dateKey(now, timezone);
  const points = new Map<string, DashboardOrderTrendPoint>();

  for (let offset = -(days - 1); offset <= 0; offset += 1) {
    const date = shiftDateKey(today, offset);
    points.set(date, {
      date,
      timestamp: dateBoundaryInTimezone(date, timezone).getTime(),
      createdOrders: 0,
      paidOrders: 0,
    });
  }

  for (const record of records) {
    const point = points.get(dateKey(record.createdAt, timezone));
    if (!point) continue;
    point.createdOrders += 1;
    if (record.paymentStatus === "PAID") point.paidOrders += 1;
  }

  return [...points.values()];
}

export function formatDashboardTrendDate(value: number, timezone: string, includeYear = false) {
  return formatDateInTimezone(value, timezone, includeYear
    ? { year: "numeric", month: "2-digit", day: "2-digit" }
    : { month: "2-digit", day: "2-digit" });
}
