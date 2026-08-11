import { AppError } from "@/lib/app-error";
import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput, PaymentCreateResult } from "./types";

export type PaymentCheckoutResult = PaymentCreateResult | { errorCode: string };

export async function onCreatePayment(input: PaymentCreateInput): Promise<PaymentCheckoutResult> {
  try {
    return await requirePaymentFlowService().create(input);
  } catch (cause) {
    if (cause instanceof AppError) return { errorCode: cause.code };
    throw cause;
  }
}

export type { PaymentCreateInput };
