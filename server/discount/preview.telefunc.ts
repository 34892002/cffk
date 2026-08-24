import { telefuncAction } from "@/server/telefunc-action";
import { getContext } from "telefunc";
import { appError } from "@/lib/app-error";
import { previewDiscount } from "./service";

type RuntimeContext = { env?: { DB?: D1Database } };

async function internalOnPreviewDiscount(input: { productId: number; productSkuId: number; quantity: number; discountCode: string }) {
  const context = getContext<RuntimeContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");
  return previewDiscount(context.env.DB, input);
}

export const onPreviewDiscount = telefuncAction(internalOnPreviewDiscount);
