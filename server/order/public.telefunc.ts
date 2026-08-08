import { getContext } from "telefunc";
import { PaymentFlowService } from "@/server/payment/flow-service";

type TelefuncContext = {
  env?: {
    DB?: D1Database;
  };
};

export type PublicOrder = NonNullable<Awaited<ReturnType<PaymentFlowService["query"]>>>;

export async function onQueryOrder(input: {
  orderNo: string;
  queryToken: string;
}): Promise<PublicOrder | null> {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) throw new Error("DATABASE_UNAVAILABLE");

  return new PaymentFlowService(context.env.DB, context.env).query(input.orderNo, input.queryToken);
}
