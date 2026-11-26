import { telefuncAction } from "@/server/telefunc-action";
import { enforceOrderRequestRateLimit } from "@/server/order/rate-limit";
import { requireDatabase } from "@/server/telefunc-context";
import { maskDiscountError, previewDiscount } from "./service";

async function internalOnPreviewDiscount(input: { productId: number; productSkuId: number; quantity: number; discountCode: string }) {
  const { database, context } = requireDatabase();
  await enforceOrderRequestRateLimit(database, { action: "PREVIEW_DISCOUNT", userId: context.user?.id ?? null, clientIp: context.clientIp });
  try {
    return await previewDiscount(database, input);
  } catch (cause) {
    return maskDiscountError(cause);
  }
}

export const onPreviewDiscount = telefuncAction(internalOnPreviewDiscount);
