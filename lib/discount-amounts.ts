import { formatCentsAsYuan, parseAmountToCents } from "@/lib/payment-utils";

export type DiscountType = "FIXED" | "PERCENT";

export function discountAmountsToYuan(type: DiscountType, value: number, minAmount: number | null) {
  return {
    value: type === "FIXED" ? formatCentsAsYuan(value) : String(value),
    minAmount: minAmount === null ? null : formatCentsAsYuan(minAmount),
  };
}

export function discountAmountsToCents(type: DiscountType, value: string, minAmount?: string | null) {
  const discountValue = type === "FIXED" ? parseAmountToCents(value) : Number.isInteger(Number(value)) ? Number(value) : null;
  const minimumAmount = !minAmount || minAmount === "0" || minAmount === "0.00" ? null : parseAmountToCents(minAmount);
  return { value: discountValue, minAmount: minimumAmount };
}
