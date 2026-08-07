export type OrderStatus = "PENDING" | "PAID" | "DELIVERED" | "CLOSED" | "FAILED";
export type PaymentStatus = "UNPAID" | "PAID" | "FAILED";

export type PaymentConfirmationOutcome = "CONFIRMED" | "ALREADY_PAID" | "NOT_PAYABLE";

export function paymentConfirmationOutcome(status: OrderStatus, paymentStatus: PaymentStatus): PaymentConfirmationOutcome {
  if (paymentStatus === "PAID") return "ALREADY_PAID";
  return status === "PENDING" && paymentStatus === "UNPAID" ? "CONFIRMED" : "NOT_PAYABLE";
}

export function canConfirmPayment(status: OrderStatus, paymentStatus: PaymentStatus) {
  return paymentConfirmationOutcome(status, paymentStatus) === "CONFIRMED";
}
