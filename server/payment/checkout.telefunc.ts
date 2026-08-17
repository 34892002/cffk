import { getContext } from "telefunc";
import { telefuncAction } from "@/server/telefunc-action";
import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput } from "./types";

type TelefuncContext = { user?: { id: string } | null };

async function internalOnCreatePayment(input: PaymentCreateInput) {
  const context = getContext<TelefuncContext>();
  return requirePaymentFlowService().create(input, context.user?.id ?? null);
}

export const onCreatePayment = telefuncAction(internalOnCreatePayment);

export type { PaymentCreateInput };
