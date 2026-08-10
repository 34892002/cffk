import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput } from "./types";

export async function onCreatePayment(input: PaymentCreateInput) {
  return requirePaymentFlowService().create(input);
}

export type { PaymentCreateInput };
