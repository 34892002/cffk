import { maskDiscountError } from "@/server/discount/service";
import { enforceOrderRequestRateLimit } from "@/server/order/rate-limit";
import { requireDatabase } from "@/server/telefunc-context";
import { telefuncAction } from "@/server/telefunc-action";
import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput } from "./types";

async function internalOnCreatePayment(input: PaymentCreateInput) {
  const { database, context } = requireDatabase();
  const userId = context.user?.id ?? null;
  await enforceOrderRequestRateLimit(database, { action: "CREATE_PAYMENT", userId, clientIp: context.clientIp });
  try {
    return await requirePaymentFlowService().create(input, userId, context.locale, context.clientIp);
  } catch (cause) {
    return maskDiscountError(cause);
  }
}

export const onCreatePayment = telefuncAction(internalOnCreatePayment);

export type { PaymentCreateInput };
