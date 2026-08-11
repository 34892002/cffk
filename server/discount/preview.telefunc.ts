import { getContext } from "telefunc";
import { appError } from "@/lib/app-error";
import { previewDiscount } from "./service";

type RuntimeContext = { env?: { DB?: D1Database } };

export async function onPreviewDiscount(input: { productId: number; quantity: number; discountCode: string }) {
  const context = getContext<RuntimeContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");
  return previewDiscount(context.env.DB, input);
}
