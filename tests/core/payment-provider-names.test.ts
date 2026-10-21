// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { displayPaymentProviderName } from "../../lib/i18n/payment-providers.ts";

describe("storefront payment provider names", () => {
  test("localizes the built-in default names", () => {
    expect(displayPaymentProviderName("ALIPAY", "支付宝", "en-US")).toBe("Alipay");
    expect(displayPaymentProviderName("ALIPAY", "支付宝", "zh-TW")).toBe("支付寶");
    expect(displayPaymentProviderName("ALIPAY", "支付宝", "zh-CN")).toBe("支付宝");
    expect(displayPaymentProviderName("EPAY", "易支付", "en-US")).toBe("EPay");
  });

  test("keeps brand names as-is", () => {
    expect(displayPaymentProviderName("STRIPE", "Stripe", "zh-TW")).toBe("Stripe");
    expect(displayPaymentProviderName("BEPUSDT", "BEpusdt", "en-US")).toBe("BEpusdt");
  });

  test("never overrides a custom administrator name", () => {
    expect(displayPaymentProviderName("ALIPAY", "支付宝直连", "en-US")).toBe("支付宝直连");
  });
});
