import { telefuncAction } from "@/server/telefunc-action";
import { getContext } from "telefunc";
import { appError } from "@/lib/app-error";
import { PaymentFlowService } from "@/server/payment/flow-service";

type TelefuncContext = {
  env?: {
    DB?: D1Database;
  };
};

export type PublicOrder = NonNullable<Awaited<ReturnType<PaymentFlowService["query"]>>>;

async function internalOnResumeOrderPayment(input: {
  orderNo: string;
  queryToken: string;
}) {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");

  return new PaymentFlowService(context.env.DB, context.env).resume(input.orderNo, input.queryToken);
}

async function internalOnQueryOrder(input: {
  orderNo: string;
  queryToken: string;
}): Promise<PublicOrder | null> {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");

  return new PaymentFlowService(context.env.DB, context.env).query(input.orderNo, input.queryToken);
}

export const onResumeOrderPayment = telefuncAction(internalOnResumeOrderPayment);
export const onQueryOrder = telefuncAction(internalOnQueryOrder);
