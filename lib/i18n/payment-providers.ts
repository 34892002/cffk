import type { StorefrontLocale } from "./locale";

// Default names seeded by scripts/seed.sql. Provider names are admin-editable
// D1 content, so only these built-in defaults are localized.
const defaultNames: Record<string, string> = {
  ALIPAY: "支付宝",
  EPAY: "易支付",
  BEPUSDT: "BEpusdt",
  STRIPE: "Stripe",
  HASHPAY: "HashPay",
  PERPAY: "PerPay",
};

const localizedNames: Record<StorefrontLocale, Record<string, string>> = {
  "zh-CN": defaultNames,
  "zh-TW": { ALIPAY: "支付寶", EPAY: "易支付" },
  "en-US": { ALIPAY: "Alipay", EPAY: "EPay" },
};

/**
 * A custom name set by the administrator is shown verbatim; only untouched
 * built-in names follow the interface language.
 */
export function displayPaymentProviderName(provider: string, storedName: string, locale: StorefrontLocale): string {
  const defaultName = defaultNames[provider];
  if (!defaultName || storedName.trim() !== defaultName) return storedName;
  return localizedNames[locale][provider] ?? storedName;
}
