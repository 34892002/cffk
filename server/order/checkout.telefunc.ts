import { getContext } from "telefunc";
import { notifyOrderEmailEvents } from "@/server/email/order-events";
import { createOrder, OrderCreationError, type CreateOrderInput } from "./service";

type TelefuncContext = {
  env?: {
    DB?: D1Database;
  };
};

type CheckoutInput = Omit<CreateOrderInput, "allowPendingPayment">;

export async function onCreateCheckoutOrder(input: CheckoutInput) {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) throw new Error("DATABASE_UNAVAILABLE");

  try {
    const created = await createOrder(context.env.DB, {
      ...input,
      allowPendingPayment: false,
    });
    if (created.paymentStatus === "PAID") await notifyOrderEmailEvents(context.env.DB, context.env, created.id);
    return created;
  } catch (error) {
    if (error instanceof OrderCreationError) throw error;
    throw error;
  }
}
