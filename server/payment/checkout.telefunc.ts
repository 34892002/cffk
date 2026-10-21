import { getContext } from "telefunc";
import { telefuncAction } from "@/server/telefunc-action";
import type { StorefrontLocale } from "@/lib/i18n/locale";
import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput } from "./types";

type TelefuncContext = { user?: { id: string } | null; locale?: StorefrontLocale };

async function internalOnCreatePayment(input: PaymentCreateInput) {
  const context = getContext<TelefuncContext>();
  return requirePaymentFlowService().create(input, context.user?.id ?? null, context.locale);
}

export const onCreatePayment = telefuncAction(internalOnCreatePayment);

export type { PaymentCreateInput };
