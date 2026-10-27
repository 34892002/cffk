/**
 * Currency helpers for the store-wide currency switch.
 *
 * Prices and every persisted amount are stored in the site base currency (CNY)
 * minor units. When the site currency is not CNY, the base amount is converted
 * with the single admin-configured rate:
 *
 *   rate = how many units of `currency` one CNY buys (1 CNY = 0.149 USD)
 *
 * Orders snapshot the rate that was active when the order was created, so
 * historical orders never depend on the current setting.
 */

export const SUPPORTED_CURRENCIES = [
  { code: "CNY", name: "人民币", decimals: 2, symbol: "¥" },
  { code: "USD", name: "美元", decimals: 2, symbol: "$" },
  { code: "TWD", name: "新台币", decimals: 2, symbol: "$" },
  { code: "JPY", name: "日元", decimals: 0, symbol: "¥" },
  { code: "EUR", name: "欧元", decimals: 2, symbol: "€" },
  { code: "GBP", name: "英镑", decimals: 2, symbol: "£" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];
export type CurrencyMeta = (typeof SUPPORTED_CURRENCIES)[number];

export const BASE_CURRENCY: CurrencyCode = "CNY";

const CURRENCY_BY_CODE = new Map(SUPPORTED_CURRENCIES.map((item) => [item.code, item]));

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCY_BY_CODE.has(value as CurrencyCode);
}

export function currencyMeta(code: CurrencyCode): CurrencyMeta {
  return CURRENCY_BY_CODE.get(code) ?? CURRENCY_BY_CODE.get(BASE_CURRENCY)!;
}

/** Example: `CNY-人民币`. */
export function currencyLabel(code: CurrencyCode): string {
  const meta = currencyMeta(code);
  return `${meta.code}-${meta.name}`;
}

export function currencyDecimals(code: CurrencyCode): number {
  return currencyMeta(code).decimals;
}

/** A valid rate is a finite positive number. Bounds are intentionally not enforced. */
export function parseExchangeRate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function isValidExchangeRate(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Convert a CNY minor-unit amount into `currency` minor units.
 * `rate` is "1 CNY = rate units of currency".
 */
export function convertFromBaseMinor(baseMinor: number, currency: CurrencyCode, rate: number): number {
  if (!Number.isSafeInteger(baseMinor) || baseMinor < 0) return 0;
  if (currency === BASE_CURRENCY) return baseMinor;
  if (!isValidExchangeRate(rate)) return 0;
  // Base has 2 decimals; scale to the target currency's precision.
  const scale = 10 ** (currencyDecimals(currency) - 2);
  return Math.max(0, Math.round(baseMinor * rate * scale));
}

/** Convert an amount in `currency` minor units back to CNY minor units. */
export function convertToBaseMinor(amountMinor: number, currency: CurrencyCode, rate: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return 0;
  if (currency === BASE_CURRENCY) return amountMinor;
  if (!isValidExchangeRate(rate)) return 0;
  const scale = 10 ** (2 - currencyDecimals(currency));
  return Math.max(0, Math.round((amountMinor / rate) * scale));
}

export function minorToAmount(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** currencyDecimals(currency);
}

/** Convert a decimal amount (e.g. a provider callback value) into minor units. */
export function amountToMinor(amount: number, currency: CurrencyCode): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 10 ** currencyDecimals(currency));
}

/** Format a minor-unit amount with the currency symbol, e.g. `$1.49`. */
export function formatMinor(amountMinor: number, currency: CurrencyCode, locale = "zh-CN"): string {
  const meta = currencyMeta(currency);
  const safeAmount = Number.isSafeInteger(amountMinor) && amountMinor >= 0 ? amountMinor : 0;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(minorToAmount(safeAmount, currency));
  return `${meta.symbol}${number}`;
}

export function formatCnyMinor(amountMinor: number, locale = "zh-CN"): string {
  return formatMinor(amountMinor, BASE_CURRENCY, locale);
}

/** Example: `1人民币 = 0.149美元`. */
export function formatRate(currency: CurrencyCode, rate: number): string {
  const value = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 8 }).format(rate);
  return `1人民币 = ${value}${currencyMeta(currency).name}`;
}
