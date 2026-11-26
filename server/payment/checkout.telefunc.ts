import { getContext } from "telefunc";
import { maskDiscountError } from "@/server/discount/service";
import { telefuncAction } from "@/server/telefunc-action";
import type { StorefrontLocale } from "@/lib/i18n/locale";
import { requirePaymentFlowService } from "./flow-service";
import type { PaymentCreateInput } from "./types";

type TelefuncContext = { user?: { id: string } | null; locale?: StorefrontLocale; clientIp?: string | null };

async function internalOnCreatePayment(input: PaymentCreateInput) {
  const context = getContext<TelefuncContext>();
  try {
    return await requirePaymentFlowService().create(input, context.user?.id ?? null, context.locale, context.clientIp);
  } catch (cause) {
    return maskDiscountError(cause);
  }
}

export const onCreatePayment = telefuncAction(internalOnCreatePayment);

export type { PaymentCreateInput };
