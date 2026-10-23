// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, expect, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import type { Database } from "bun:sqlite";
import { createOrder, getOrderForQuery } from "../../server/order/service.ts";
import { getEnabledPaymentProviders, getPaymentProvider } from "@/server/payment/config";
import { getSiteSettings, invalidateSiteSettings } from "@/server/site/public-settings";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  invalidateSiteSettings();
  while (databases.length) databases.pop()!.close();
});

function seedUsdStore(sqlite: Database) {
  const now = Date.now();
  sqlite.query("INSERT INTO siteSetting (id, siteName, siteUrl, registrationEnabled, timezone, currency, exchangeRate, createdAt, updatedAt) VALUES (1, 'USD Shop', 'https://shop.example.com', 1, 'Asia/Shanghai', 'USD', 0.149, ?, ?)").run(now, now);
  sqlite.query("INSERT INTO product_v2 (name, slug, status, sort, createdAt, updatedAt) VALUES ('USD product', 'usd-product', 'ACTIVE', 0, ?, ?)").run(now, now);
  const product = sqlite.query("SELECT id FROM product_v2 WHERE slug = 'usd-product'").get() as { id: number };
  sqlite.query("INSERT INTO productSku (productId, name, price, status, deliveryType, fixedDeliveryContent, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (?, 'Default', 1000, 'ACTIVE', 'FIXED_CARD', 'LICENSE-USD-001', 1, 1, 0, ?, ?)")
    .run(product.id, now, now);
  return { productId: product.id, productSkuId: (sqlite.query("SELECT id FROM productSku WHERE productId = ?").get(product.id) as { id: number }).id };
}

describe("currency snapshot on orders", () => {
  test("converts the CNY list price into the store currency and snapshots the rate", async () => {
    const context = createTestDatabase();
    databases.push(context);
    const { productId, productSkuId } = seedUsdStore(context.sqlite);
    invalidateSiteSettings();

    const created = await createOrder(context.database, {
      productId,
      productSkuId,
      quantity: 1,
      paymentProvider: "ALIPAY",
      contactType: "EMAIL",
      contactValue: "buyer@example.com",
    }, null);

    // ¥10.00 × 0.149 = $1.49
    expect(created).toMatchObject({ amount: 149, currency: "USD", exchangeRate: 0.149, baseAmount: 1000 });

    const queried = await getOrderForQuery(context.database, created.orderNo, null, "buyer@example.com");
    expect(queried).toMatchObject({ currency: "USD", exchangeRate: 0.149 });
    expect(queried?.amount).toContain("1.49");
    expect(queried?.baseAmount).toContain("10.00");
  });

  test("hides CNY-only providers when the store charges USD", async () => {
    const context = createTestDatabase();
    databases.push(context);
    seedUsdStore(context.sqlite);
    const now = Date.now();
    context.sqlite.query("INSERT INTO paymentProvider (provider, name, isEnabled, sort, configJson, createdAt, updatedAt) VALUES ('ALIPAY', '支付宝', 1, 0, ?, ?, ?)").run(JSON.stringify({
      schemaVersion: 1,
      modes: ["web"],
      baseUrl: "https://openapi.alipay.com",
      appId: "app",
      sellerId: "seller",
      privateKey: "private",
      alipayPublicKey: "public",
      notifyUrl: "https://shop.example.com/api/payments/alipay/notify",
      returnUrl: "https://shop.example.com/payment-result",
    }), now, now);
    invalidateSiteSettings();
    expect(await getEnabledPaymentProviders(context.database)).toEqual([]);

    context.sqlite.query("UPDATE siteSetting SET currency = 'CNY', exchangeRate = 1 WHERE id = 1").run();
    invalidateSiteSettings();
    expect((await getSiteSettings(context.database)).currency).toBe("CNY");
    const stored = context.sqlite.query("SELECT provider, configJson FROM paymentProvider").get();
    expect(stored).toMatchObject({ provider: "ALIPAY" });
    expect((await getPaymentProvider(context.database, "ALIPAY"))?.configStatus).toBe("valid");
    expect((await getEnabledPaymentProviders(context.database)).map((item) => item.provider)).toContain("ALIPAY");
  });
});
