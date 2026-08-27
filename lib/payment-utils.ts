export function parseAmountToCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCentsAsYuan(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Amount must be a non-negative integer in cents");
  return (value / 100).toFixed(2);
}

export function formatMinorAmount(value: string | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !/^(0|[1-9]\d*)$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 8) return "-";
  const digits = value.padStart(decimals + 1, "0");
  if (decimals === 0) return digits;
  const split = digits.length - decimals;
  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}

export function canonicalizeAlipayParameters(parameters: Record<string, string>, excludeSignType = false) {
  return Object.entries(parameters)
    .filter(([key, value]) => key !== "sign" && (!excludeSignType || key !== "sign_type") && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
