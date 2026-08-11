import { telefuncAction } from "@/server/telefunc-action";
import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput } from "./types";

async function internalOnCreatePayment(input: PaymentCreateInput) {
  return requirePaymentFlowService().create(input);
}

export const onCreatePayment = telefuncAction(internalOnCreatePayment);

export type { PaymentCreateInput };
