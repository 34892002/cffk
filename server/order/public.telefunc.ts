import { desc, eq } from "drizzle-orm";
import { getContext } from "telefunc";
import { createDrizzleDb } from "@/database/drizzle";
import { order } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { formatCentsAsYuan } from "@/lib/payment-utils";
import { PaymentFlowService } from "@/server/payment/flow-service";
import { enforceOrderRequestRateLimit } from "@/server/order/rate-limit";
import { telefuncAction } from "@/server/telefunc-action";
import { requireUser, type TelefuncContext } from "@/server/telefunc-context";


export type PublicOrder = NonNullable<Awaited<ReturnType<PaymentFlowService["query"]>>>;

export type AccountOrderSummary = {
  orderNo: string;
  productName: string;
  amount: string;
  status: PublicOrder["status"];
  paymentStatus: PublicOrder["paymentStatus"];
  deliveryStatus: PublicOrder["deliveryStatus"];
  createdAt: Date;
};

export type AccountOrderList = {
  orders: AccountOrderSummary[];
  truncated: boolean;
};

async function internalOnListAccountOrders(): Promise<AccountOrderList> {
  const { database, user } = requireUser();
  const records = await createDrizzleDb(database).select({
    orderNo: order.orderNo,
    productName: order.productNameSnapshot,
    amount: order.amount,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    createdAt: order.createdAt,
  }).from(order)
    .where(eq(order.ownerUserId, user.id))
    .orderBy(desc(order.createdAt), desc(order.id))
    .limit(51);

  return {
    orders: records.slice(0, 50).map(record => ({
      ...record,
      amount: formatCentsAsYuan(record.amount),
    })),
    truncated: records.length > 50,
  };
}

async function internalOnResumeOrderPayment(input: {
  orderNo: string;
  email?: string;
}) {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");
  const userId = context.user?.id ?? null;
  await enforceOrderRequestRateLimit(context.env.DB, {
    action: "RESUME",
    userId,
    clientIp: context.clientIp,
  });

  return new PaymentFlowService(context.env.DB, context.env).resume(input.orderNo, userId, input.email);
}

async function internalOnQueryOrder(input: {
  orderNo: string;
  email?: string;
}): Promise<PublicOrder | null> {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");
  const userId = context.user?.id ?? null;
  await enforceOrderRequestRateLimit(context.env.DB, {
    action: "QUERY",
    userId,
    clientIp: context.clientIp,
  });

  return new PaymentFlowService(context.env.DB, context.env).query(input.orderNo, userId, input.email);
}

export const onListAccountOrders = telefuncAction(internalOnListAccountOrders);
export const onResumeOrderPayment = telefuncAction(internalOnResumeOrderPayment);
export const onQueryOrder = telefuncAction(internalOnQueryOrder);
