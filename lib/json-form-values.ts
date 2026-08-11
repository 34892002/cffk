export type JsonFormInputValue = string | number | boolean | string[];

export function normalizeJsonFormInputValue(type: string, value: unknown): JsonFormInputValue {
  if (type !== "number") return typeof value === "string" ? value : "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value !== "string" || !value.trim()) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}
