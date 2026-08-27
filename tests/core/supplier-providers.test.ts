import { describe, expect, test } from "bun:test";
import { AcgAdapter } from "../../server/supplier/providers/acg";
import { AcgV311Adapter } from "../../server/supplier/providers/acg-v3.1.1";
import { DujiaoNextAdapter } from "../../server/supplier/providers/dujiao-next";
import { signAcgForm, signDujiaoNextRequest } from "../../server/supplier/providers/signatures";
import { supplierFetchJson } from "../../server/supplier/providers/http";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("ACG signs form requests and maps products and stock", async () => {
  const calls: Request[] = [];
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/authentication/connect")) return jsonResponse({ code: 200, data: { username: "ACG", balance: "12.34" } });
      if (path.endsWith("/items")) return jsonResponse({ code: 200, data: [{ id: 1, name: "分类", children: [{ id: 2, code: "SKU-2", name: "商品", description: "说明", price: "1.25", user_price: "1.25", factory_price: "1.25", stock: null, delivery_way: 1, config: { race: "月卡", sku: { "机身颜色": "黑色" }, card_id: 7 }, widget: [{ name: "email", value: "buyer@example.com" }] }] }] });
      throw new Error(`unexpected path: ${path}`);
    },
  });
  await expect(adapter.testConnection()).resolves.toEqual({ siteName: "ACG", balance: { amountMinor: "1234", currency: "CNY" } });
  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, products: [{ id: "SKU-2", skus: [{ id: "SKU-2", costMinor: "125", stockQuantity: 2_147_483_647, purchaseContext: { race: "月卡", sku: { "机身颜色": "黑色" }, cardId: 7, widget: { email: "buyer@example.com" } } }] }] });
  const connectForm = new URLSearchParams(await calls[0].clone().text());
  expect(connectForm.get("app_id")).toBe("api-id");
  expect(connectForm.get("sign")).toBe(signAcgForm({ app_id: "api-id" }, "app-key"));
});

test("ACG falls back to its catalog when the item endpoint is unavailable", async () => {
  const calls: Array<{ path: string; form: URLSearchParams }> = [];
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const form = new URLSearchParams(await request.text());
      calls.push({ path, form });
      if (path.endsWith("/commodity/item")) return jsonResponse({ code: 0, msg: "unsupported" });
      if (path.endsWith("/commodity/items")) return jsonResponse({ code: 200, data: [{ id: 1, name: "分类", children: [{ id: 2, code: "SKU-2", name: "商品", price: "1.25", user_price: "1.25", factory_price: "1.25", stock: 9, status: 1 }] }] });
      if (path.endsWith("/commodity/stock")) return jsonResponse({ code: 200, data: { stock: "8" } });
      throw new Error(`unexpected path: ${path}`);
    },
  });

  await expect(adapter.getSku("SKU-2", "SKU-2")).resolves.toMatchObject({ id: "SKU-2", costMinor: "125", stockQuantity: 8 });
  const stockRequest = calls.find((call) => call.path.endsWith("/commodity/stock"));
  expect(stockRequest?.form.get("code")).toBe("SKU-2");
  expect(stockRequest?.form.get("sku")).toBeNull();
});

test("ACG maps the real v3.1.2+ catalog response shape", async () => {
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async () => jsonResponse({ code: 200, data: [{ id: 1, name: "DEMO", children: [{ id: 2, name: "哈喽", description: "<p>商品说明</p>", cover: "/assets/demo.jpg", factory_price: 1.5, price: 9.9, user_price: 3.3, status: 1, code: "E8D947F2522800C0", delivery_way: 1, stock: 9_999_999, widget: "[]", tags: '[{"text":"月卡","color":"orange"}]', config: { category: { "月费": "20", "年费": "150" }, category_factory: { "月费": 20, "年费": 150 } } }] }] }),
  });
  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).resolves.toMatchObject({
    total: 1,
    products: [{ id: "E8D947F2522800C0", imageUrls: ["https://acg.example/assets/demo.jpg"], active: true, skus: [{ id: "月费", costMinor: "2000", retailPriceMinor: "990", memberPriceMinor: "330", stockQuantity: 9_999_999, active: true, purchaseContext: { code: "E8D947F2522800C0", race: "月费" } }, { id: "年费", costMinor: "15000", retailPriceMinor: "990", memberPriceMinor: "330", stockQuantity: 9_999_999, active: true, purchaseContext: { code: "E8D947F2522800C0", race: "年费" } }] }],
  });
});

test("ACG maps category choices as independent SKUs", async () => {
  const requests: Array<{ path: string; form: URLSearchParams }> = [];
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      requests.push({ path: new URL(request.url).pathname, form: new URLSearchParams(await request.text()) });
      const path = new URL(request.url).pathname;
      if (path.endsWith("/item")) return jsonResponse({ code: 200, data: { code: "HELLO", name: "哈喽", price: 9.9, user_price: 3.3, stock: 123, status: 1, delivery_way: 1, config: { category: { "月费": "20", "季费": "70", "年费": "150" } } } });
      if (path.endsWith("/stock")) return jsonResponse({ code: 200, data: { stock: 123 } });
      if (path.endsWith("/valuation")) return jsonResponse({ code: 200, data: { price: "6.60" } });
      if (path.endsWith("/trade")) return jsonResponse({ code: 200, data: { tradeNo: "trade-hello", secret: "CARD" } });
      throw new Error(`unexpected path: ${path}`);
    },
  });

  const product = await adapter.getSku("HELLO", "季费");
  expect(product.id).toBe("季费");
  expect(product.name).toBe("哈喽 · 季费");
  expect(product.purchaseContext).toMatchObject({ code: "HELLO", race: "季费" });
  await expect(adapter.quote!({ skuId: product.id, quantity: 1, purchaseContext: product.purchaseContext })).resolves.toEqual({ unitCostMinor: "660", totalCostMinor: "660" });
  await expect(adapter.submitOrder({ skuId: product.id, quantity: 1, requestNo: "hello-req", callbackUrl: "", traceId: "hello-trace", purchaseContext: product.purchaseContext })).resolves.toEqual({ status: "supplied", upstreamOrderId: "trade-hello", cards: ["CARD"] });
  expect(requests.find((request) => request.path.endsWith("/valuation"))?.form.get("code")).toBe("HELLO");
  expect(requests.find((request) => request.path.endsWith("/valuation"))?.form.get("race")).toBe("季费");
  expect(requests.find((request) => request.path.endsWith("/trade"))?.form.get("shared_code")).toBe("HELLO");
  expect(requests.find((request) => request.path.endsWith("/trade"))?.form.get("race")).toBe("季费");
});

test("ACG quotes v3.1.2+ SKU context through valuation", async () => {
  let quoted: URLSearchParams | undefined;
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      quoted = new URLSearchParams(await request.text());
      return jsonResponse({ code: 200, data: { price: "2.50" } });
    },
  });
  await expect(adapter.quote?.({ skuId: "CODE-1", quantity: 2, purchaseContext: { race: "月卡", sku: { "机身颜色": "黑色" }, cardId: 7 } })).resolves.toEqual({ unitCostMinor: "250", totalCostMinor: "500" });
  expect(quoted?.get("code")).toBe("CODE-1");
  expect(quoted?.get("num")).toBe("2");
  expect(quoted?.get("sku[机身颜色]")).toBe("黑色");
});

test("ACG submits v3.1.2+ race, bracketed SKU, card and widget fields", async () => {
  let submitted: URLSearchParams | undefined;
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname.endsWith("/trade")) submitted = new URLSearchParams(await request.text());
      return jsonResponse({ code: 200, data: { tradeNo: "trade-ctx", secret: "card-context" } });
    },
  });
  await expect(adapter.submitOrder({ skuId: "CODE-1", quantity: 1, requestNo: "req-context", callbackUrl: "", traceId: "trace-context", purchaseContext: { race: "月卡", sku: { "机身颜色": "黑色" }, cardId: 7, widget: { email: "buyer@example.com" } } })).resolves.toEqual({ status: "supplied", upstreamOrderId: "trade-ctx", cards: ["card-context"] });
  expect(submitted?.get("race")).toBe("月卡");
  expect(submitted?.get("sku[机身颜色]")).toBe("黑色");
  expect(submitted?.get("card_id")).toBe("7");
  expect(submitted?.get("email")).toBe("buyer@example.com");
  expect(submitted?.get("sku")).toBeNull();
});

test("ACG manual delivery waits instead of exposing the waiting message", async () => {
  const responses = [
    jsonResponse({ code: 200, data: { tradeNo: "manual-1", secret: "请等待上游人工发货" } }),
    jsonResponse({ code: 200, data: { status: 1, secret: "" } }),
    jsonResponse({ code: 200, data: { status: 1, secret: "REAL-CARD" } }),
  ];
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async () => responses.shift()!,
  });
  const context = { deliveryWay: 0 };
  await expect(adapter.submitOrder({ skuId: "MANUAL", quantity: 1, requestNo: "manual-req", callbackUrl: "", traceId: "manual-trace", purchaseContext: context })).resolves.toEqual({ status: "processing", upstreamOrderId: "manual-1" });
  await expect(adapter.reconcileOrder({ upstreamOrderId: "manual-1", skuId: "MANUAL", quantity: 1, requestNo: "manual-req", callbackUrl: "", traceId: "manual-trace", purchaseContext: context })).resolves.toEqual({ status: "processing", upstreamOrderId: "manual-1" });
  await expect(adapter.reconcileOrder({ upstreamOrderId: "manual-1", skuId: "MANUAL", quantity: 1, requestNo: "manual-req", callbackUrl: "", traceId: "manual-trace", purchaseContext: context })).resolves.toEqual({ status: "supplied", upstreamOrderId: "manual-1", cards: ["REAL-CARD"] });
});

test("ACG reconciliation never submits a second order", async () => {
  let calls = 0;
  const adapter = new AcgAdapter({
    baseUrl: "https://acg.example",
    apiId: "api-id",
    appKey: "app-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async () => { calls += 1; return jsonResponse({ code: 200, data: {} }); },
  });
  await expect(adapter.reconcileOrder({ upstreamOrderId: "trade-1", skuId: "7", quantity: 1, requestNo: "req-1", callbackUrl: "", traceId: "trace-1" })).resolves.toEqual({ status: "processing", upstreamOrderId: "trade-1" });
  expect(calls).toBe(1);
});

test("supplier responses above the default 1 MiB limit are rejected", async () => {
  const payload = JSON.stringify({ data: "x".repeat(1024 * 1024) });
  await expect(supplierFetchJson(
    async () => new Response(payload, { headers: { "content-type": "application/json" } }),
    "https://supplier.example/catalog",
    {},
  )).rejects.toThrow("Supplier returned an invalid response");
});

test("ACG v3.1.1 catalog accepts a bounded full catalog and returns one page", async () => {
  const description = "x".repeat(600_000);
  const adapter = new AcgV311Adapter({
    baseUrl: "https://acg-legacy.example",
    apiId: "legacy-id",
    appKey: "legacy-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async () => jsonResponse({ code: 200, data: [{ name: "分类", children: [
      { code: "LEGACY-1", name: "商品 1", description },
      { code: "LEGACY-2", name: "商品 2", description },
    ] }] }),
  });

  await expect(adapter.listProducts({ page: 2, pageSize: 1 })).resolves.toMatchObject({
    total: 2,
    products: [{ id: "LEGACY-2" }],
  });
});

test("ACG v3.1.1 reuses the catalog across adapter instances", async () => {
  let catalogRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/items")) {
      catalogRequests += 1;
      return jsonResponse({ code: 200, data: [{ name: "分类", children: [{ code: "CACHE-1", name: "Cached product" }] }] });
    }
    throw new Error(`unexpected path: ${path}`);
  };
  try {
    const input = { baseUrl: "https://acg-cross-instance.example", apiId: "cache-id", appKey: "cache-key", currency: "CNY", currencyDecimals: 2 };
    await new AcgV311Adapter(input).listProducts({ page: 1, pageSize: 1 });
    await new AcgV311Adapter(input).listProducts({ page: 2, pageSize: 1 });
    expect(catalogRequests).toBe(1);
    await new AcgV311Adapter(input).listProducts({ page: 1, pageSize: 1, forceRefresh: true });
    expect(catalogRequests).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ACG v3.1.1 and earlier uses the shared legacy API", async () => {
  const paths: string[] = [];
  const adapter = new AcgV311Adapter({
    baseUrl: "https://acg-legacy.example",
    apiId: "legacy-id",
    appKey: "legacy-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.endsWith("/connect")) return jsonResponse({ code: 200, data: { shopName: "Legacy ACG", balance: "20.00" } });
      if (path.endsWith("/items")) return jsonResponse({ code: 200, data: [{ id: 1, name: "分类", children: [{ id: 2, code: "LEGACY-1", name: "Legacy product", description: "说明", price: "2.00", user_price: "1.50", stock: "9", status: 1, delivery_way: 1 }] }] });
      if (path.endsWith("/inventory")) return jsonResponse({ code: 200, data: { count: "8", user_price: "1.50" } });
      if (path.endsWith("/trade")) return jsonResponse({ code: 200, data: { tradeNo: "legacy-order", secret: "LEGACY-CARD" } });
      if (path.endsWith("/query")) return jsonResponse({ code: 200, data: { secret: "LEGACY-CARD" } });
      throw new Error(`unexpected path: ${path}`);
    },
  });
  await expect(adapter.testConnection()).resolves.toMatchObject({ siteName: "Legacy ACG" });
  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, products: [{ id: "LEGACY-1" }] });
  const sku = await adapter.getSku("LEGACY-1", "LEGACY-1");
  expect(sku.stockQuantity).toBe(8);
  await expect(adapter.quote?.({ skuId: sku.id, quantity: 2, purchaseContext: sku.purchaseContext })).resolves.toEqual({ unitCostMinor: "150", totalCostMinor: "300" });
  await expect(adapter.submitOrder({ skuId: sku.id, quantity: 1, requestNo: "legacy-req", callbackUrl: "", traceId: "legacy-trace", purchaseContext: sku.purchaseContext })).resolves.toEqual({ status: "supplied", upstreamOrderId: "legacy-order", cards: ["LEGACY-CARD"] });
  await expect(adapter.reconcileOrder({ upstreamOrderId: "legacy-order", skuId: sku.id, quantity: 1, requestNo: "legacy-req", callbackUrl: "", traceId: "legacy-trace", purchaseContext: sku.purchaseContext })).resolves.toEqual({ status: "supplied", upstreamOrderId: "legacy-order", cards: ["LEGACY-CARD"] });
  expect(paths.every((path) => path.startsWith("/shared/"))).toBe(true);
  expect(paths.filter((path) => path.endsWith("/items"))).toHaveLength(1);
});

test("ACG v3.1.1 catalog failures are retried", async () => {
  let catalogAttempts = 0;
  const adapter = new AcgV311Adapter({
    baseUrl: "https://acg-legacy.example",
    apiId: "legacy-id",
    appKey: "legacy-key",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async () => {
      catalogAttempts += 1;
      if (catalogAttempts === 1) return jsonResponse({ code: 500, msg: "temporary failure" });
      return jsonResponse({ code: 200, data: [{ name: "分类", children: [{ code: "LEGACY-1", name: "商品 1" }] }] });
    },
  });

  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "acg_request_failed" });
  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, products: [{ id: "LEGACY-1" }] });
  expect(catalogAttempts).toBe(2);
});


test("Dujiao Next accepts array-wrapped catalog responses", async () => {
  const adapter = new DujiaoNextAdapter({ baseUrl: "https://dujiao.example", apiKey: "api-key", apiSecret: "api-secret", currency: "CNY", currencyDecimals: 2, fetcher: async (input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    if (path.endsWith("/categories")) return jsonResponse({ categories: [] });
    return jsonResponse({ ok: true, data: [{ id: 1, title: { "zh-CN": "商品" }, description: null, images: null, tags: null, category_id: 0, is_active: true, skus: [{ id: 2, sku_code: "DEFAULT", spec_values: null, price_amount: "1.00", stock_quantity: 1, is_active: true }] }] });
  } });
  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, products: [{ id: "1", name: "商品" }] });
});

test("Dujiao Next accepts data-wrapped catalog responses", async () => {
  const adapter = new DujiaoNextAdapter({
    baseUrl: "https://dujiao.example",
    apiKey: "api-key",
    apiSecret: "api-secret",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      if (path.endsWith("/categories")) return jsonResponse({ categories: [] });
      return jsonResponse({ ok: true, data: { total: 1, items: [{ id: 1, title: { "zh-CN": "商品" }, description: null, images: null, tags: null, category_id: 0, is_active: true, skus: [{ id: 2, sku_code: "DEFAULT", spec_values: null, price_amount: "1.00", stock_quantity: 1, is_active: true }] }] } });
    },
  });
  await expect(adapter.listProducts({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, products: [{ id: "1", name: "商品" }] });
});

test("Dujiao Next requests at most 100 products per page", async () => {
  let requestedPageSize = "";
  const adapter = new DujiaoNextAdapter({
    baseUrl: "https://dujiao.example",
    apiKey: "api-key",
    apiSecret: "api-secret",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      requestedPageSize = url.searchParams.get("page_size") ?? "";
      if (url.pathname.endsWith("/categories")) return jsonResponse({ ok: true, categories: [] });
      return jsonResponse({ ok: true, total: 0, items: [] });
    },
  });
  await adapter.listProducts({ page: 1, pageSize: 500, includeInactive: true });
  expect(requestedPageSize).toBe("100");
});

test("Dujiao Next exposes structured catalog errors", async () => {
  const adapter = new DujiaoNextAdapter({
    baseUrl: "https://dujiao.example",
    apiKey: "api-key",
    apiSecret: "api-secret",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      if (path.endsWith("/categories")) return jsonResponse({ ok: true, categories: [] });
      return jsonResponse({ ok: false, error_code: "invalid_api_key", error_message: "API Key 无效或已禁用" });
    },
  });
  await expect(adapter.listProducts({ page: 1, pageSize: 50 })).rejects.toMatchObject({ code: "invalid_api_key", status: 502, message: "API Key 无效或已禁用" });
});

test("Dujiao Next retries an upstream rate-limit response", async () => {
  let attempts = 0;
  const adapter = new DujiaoNextAdapter({
    baseUrl: "https://dujiao.example",
    apiKey: "api-key",
    apiSecret: "api-secret",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      if (path.endsWith("/categories")) return jsonResponse({ ok: true, categories: [] });
      attempts += 1;
      if (attempts === 1) return jsonResponse({ status_code: "429", msg: "请求频率超限" });
      return jsonResponse({ ok: true, total: 0, items: [] });
    },
  });
  await expect(adapter.listProducts({ page: 1, pageSize: 100 })).resolves.toMatchObject({ total: 0, products: [] });
  expect(attempts).toBe(2);
});

test("Dujiao Next accepts nullable catalog fields", async () => {
  const adapter = new DujiaoNextAdapter({
    baseUrl: "https://dujiao.example",
    apiKey: "api-key",
    apiSecret: "api-secret",
    currency: "CNY",
    currencyDecimals: 2,
    fetcher: async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      if (path.endsWith("/categories")) return jsonResponse({ ok: true, categories: [] });
      return jsonResponse({ ok: true, total: 1, page: 1, page_size: 50, items: [{ id: 49, slug: null, title: { "zh-CN": "商品" }, description: null, images: null, tags: null, category_id: 0, is_active: true, skus: [{ id: 1, sku_code: "DEFAULT", spec_values: null, price_amount: "1.50", member_price: null, stock_quantity: 3, is_active: true }] }] });
    },
  });
  await expect(adapter.listProducts({ page: 1, pageSize: 50 })).resolves.toMatchObject({ total: 1, products: [{ id: "49", name: "商品", description: "", imageUrls: [], categoryNames: [], skus: [{ id: "1", name: "DEFAULT", costMinor: "150", stockQuantity: 3 }] }] });
});

test("Dujiao Next signs JSON and maps processing and delivered results", async () => {
  const calls: Request[] = [];
  const adapter = new DujiaoNextAdapter({
    baseUrl: "https://dujiao.example",
    apiKey: "api-key",
    apiSecret: "api-secret",
    currency: "CNY",
    currencyDecimals: 2,
    now: () => 1_700_000_000_000,
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/orders")) return jsonResponse({ ok: true, order_id: 88, order_no: "DJ-88", status: "paid", amount: "7.90", currency: "CNY" });
      if (path.endsWith("/orders/88")) return jsonResponse({ ok: true, order_id: 88, order_no: "DJ-88", status: "completed", amount: "7.90", currency: "CNY", items: [{ product_id: 1, sku_id: 7, title: { "zh-CN": "商品" }, quantity: 2, unit_price: "3.95", total_price: "7.90", fulfillment_type: "auto" }], fulfillment: { type: "auto", status: "delivered", payload: "card-a\ncard-b", delivery_data: null, delivered_at: "2026-03-01T12:01:00Z" } });
      throw new Error(`unexpected path: ${path}`);
    },
  });
  await expect(adapter.submitOrder({ skuId: "7", quantity: 2, requestNo: "req-1", callbackUrl: "https://cffk.example/callback", traceId: "trace-1" })).resolves.toEqual({ status: "processing", upstreamOrderId: "88" });
  await expect(adapter.reconcileOrder({ upstreamOrderId: "88" })).resolves.toEqual({ status: "supplied", upstreamOrderId: "88", cards: ["card-a", "card-b"] });
  const body = await calls[0].clone().text();
  expect(calls[0].headers.get("Dujiao-Next-Api-Key")).toBe("api-key");
  expect(calls[0].headers.get("Dujiao-Next-Signature")).toBe(signDujiaoNextRequest({ method: "POST", path: "/api/v1/upstream/orders", timestamp: "1700000000", rawBody: body, apiSecret: "api-secret" }));
});

describe("supplier signature guards", () => {
  test("rejects query strings in Dujiao signing path", () => {
    expect(() => signDujiaoNextRequest({ method: "GET", path: "/items?x=1", timestamp: "1", rawBody: "", apiSecret: "secret" })).toThrow();
  });
});
