import { SupplierDomainError } from "./error";

export function decimalToMinor(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
    throw new SupplierDomainError("invalid_supplier_money", 502, "Supplier returned an invalid monetary value");
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) {
    throw new SupplierDomainError("invalid_supplier_money", 502, "Supplier returned an invalid monetary value");
  }
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  return (BigInt(match[1] ?? "0") * 10n ** BigInt(decimals) + BigInt(fraction || "0")).toString();
}
