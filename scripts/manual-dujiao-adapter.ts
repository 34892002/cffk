import { DujiaoNextAdapter } from "../server/supplier/providers/dujiao-next";

const baseUrl = process.env.DUJIAO_BASE_URL?.trim().replace(/\/$/, "");
const apiKey = process.env.DUJIAO_API_KEY?.trim();
const apiSecret = process.env.DUJIAO_API_SECRET;

if (!baseUrl || !apiKey || !apiSecret) {
  throw new Error("请设置 DUJIAO_BASE_URL、DUJIAO_API_KEY、DUJIAO_API_SECRET 环境变量");
}

const adapter = new DujiaoNextAdapter({
  baseUrl,
  apiKey,
  apiSecret,
  currency: "CNY",
  currencyDecimals: 2,
});

try {
  const result = await adapter.listProducts({ page: 1, pageSize: 50, includeInactive: true });
  console.log(JSON.stringify({ ok: true, total: result.total, returned: result.products.length, firstProducts: result.products.slice(0, 5).map((product) => ({ id: product.id, name: product.name, skuCount: product.skus.length })) }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, errorCode: error instanceof Error && "code" in error ? error.code : undefined, message: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
