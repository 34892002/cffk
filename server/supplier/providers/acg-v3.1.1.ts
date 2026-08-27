import { z } from "zod";
import { SupplierDomainError } from "../error";
import { decimalToMinor } from "../money";
import type { SupplierPurchaseResult } from "../schema";
import { supplierFetchJson } from "./http";
import { signAcgForm } from "./signatures";
import type { SupplierAdapter, SupplierProduct, SupplierPurchaseContext } from "./types";

const itemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().max(512),
  code: z.string().max(512).optional(),
  description: z.string().max(640_000).optional().default(""),
  introduce: z.string().max(640_000).optional(),
  cover: z.string().max(2048).nullable().optional(),
  picture_url: z.string().max(2048).nullable().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  user_price: z.union([z.string(), z.number()]).optional(),
  factory_price: z.union([z.string(), z.number()]).optional(),
  stock: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.union([z.string(), z.number()]).nullable().optional(),
  delivery_way: z.union([z.string(), z.number()]).nullable().optional(),
  config: z.unknown().optional(),
});
const categorySchema: z.ZodType<unknown> = z.object({
  name: z.string().max(512),
  children: z.array(z.unknown()).default([]),
});
const inventorySchema = z.object({
  count: z.union([z.string(), z.number()]).nullable().optional(),
  user_price: z.union([z.string(), z.number()]).optional(),
});

// Legacy Shared API only exposes an unpaginated, full catalog endpoint.
const LEGACY_CATALOG_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const LEGACY_CATALOG_CACHE_TTL_MS = 5 * 60_000;
const sharedCatalogs = new Map<string, { expiresAt: number; promise: Promise<SupplierProduct[]> }>();

/** ACG 3.1.1 and earlier Shared Open API adapter. */
export class AcgV311Adapter implements SupplierAdapter {
  private catalogPromise: Promise<SupplierProduct[]> | undefined;

  constructor(private readonly input: { baseUrl: string; apiId: string; appKey: string; currency: string; currencyDecimals: number; fetcher?: typeof fetch }) {}

  async testConnection() {
    const data = z.object({ shopName: z.string().optional(), username: z.string().optional(), balance: z.union([z.string(), z.number()]).optional() }).parse(await this.request("/shared/authentication/connect"));
    return {
      siteName: data.shopName ?? data.username ?? "ACG",
      balance: { amountMinor: decimalToMinor(String(data.balance ?? "0"), this.input.currencyDecimals), currency: this.input.currency },
    };
  }

  async listProducts(input: { page: number; pageSize: number; forceRefresh?: boolean }) {
    const products = await this.catalog(input.forceRefresh);
    const start = Math.max(0, (input.page - 1) * input.pageSize);
    return { total: products.length, products: products.slice(start, start + input.pageSize) };
  }

  async getSku(productId: string, skuId: string) {
    const product = await this.findProduct(productId, skuId);
    const sku = product.skus.find((value) => value.id === skuId);
    if (!sku) throw new SupplierDomainError("supplier_sku_not_found", 404, "Supplier SKU was not found");
    const context = sku.purchaseContext ?? {};
    const inventory = inventorySchema.parse(await this.request("/shared/commodity/inventory", {
      sharedCode: context.code ?? productId,
      ...(context.race ? { race: context.race } : {}),
    }));
    return { ...sku, stockQuantity: normalizeStock(inventory.count) };
  }

  async quote(input: { skuId: string; quantity: number; purchaseContext?: SupplierPurchaseContext }) {
    const context = input.purchaseContext ?? {};
    const inventory = inventorySchema.parse(await this.request("/shared/commodity/inventory", {
      sharedCode: context.code ?? input.skuId,
      ...(context.race ? { race: context.race } : {}),
    }));
    if (inventory.user_price === undefined) throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier did not return a purchase price");
    const unitCostMinor = decimalToMinor(String(inventory.user_price), this.input.currencyDecimals);
    return { unitCostMinor, totalCostMinor: (BigInt(unitCostMinor) * BigInt(input.quantity)).toString() };
  }

  async submitOrder(input: { skuId: string; quantity: number; requestNo: string; callbackUrl: string; traceId: string; purchaseContext?: SupplierPurchaseContext }): Promise<SupplierPurchaseResult> {
    const context = input.purchaseContext ?? {};
    const data = z.object({ tradeNo: z.string().optional(), trade_no: z.string().optional(), secret: z.string().nullable().optional() }).parse(await this.request("/shared/commodity/trade", {
      shared_code: context.code ?? input.skuId,
      num: String(input.quantity),
      request_no: input.requestNo,
      contact: input.callbackUrl || "cffk",
      device: "0",
      ...(context.race ? { race: context.race } : {}),
    }));
    const upstreamOrderId = data.tradeNo ?? data.trade_no;
    if (!upstreamOrderId) throw new SupplierDomainError("supplier_order_id_missing", 502, "ACG did not return a trade number");
    const cards = parseCards(data.secret ?? "", context.deliveryWay);
    return cards.length ? { status: "supplied", upstreamOrderId, cards } : { status: "processing", upstreamOrderId };
  }

  async reconcileOrder(input: { upstreamOrderId: string | null; skuId: string; quantity: number; requestNo: string; callbackUrl: string; traceId: string; purchaseContext?: SupplierPurchaseContext }): Promise<SupplierPurchaseResult> {
    if (!input.upstreamOrderId) return { status: "uncertain", upstreamOrderId: null, errorCode: "acg_order_id_missing" };
    const data = z.object({ secret: z.string().nullable().optional() }).parse(await this.request("/shared/commodity/query", { tradeNo: input.upstreamOrderId }));
    const cards = parseCards(data.secret ?? "", input.purchaseContext?.deliveryWay);
    return cards.length ? { status: "supplied", upstreamOrderId: input.upstreamOrderId, cards } : { status: "processing", upstreamOrderId: input.upstreamOrderId };
  }

  private async findProduct(productId: string, skuId: string) {
    const product = (await this.catalog()).find((item) => item.id === productId || item.skus.some((sku) => sku.id === skuId));
    if (!product) throw new SupplierDomainError("supplier_sku_not_found", 404, "Supplier SKU was not found");
    return product;
  }

  private async catalog(forceRefresh = false) {
    if (!forceRefresh && this.catalogPromise) return this.catalogPromise;
    if (this.input.fetcher) return this.loadInstanceCatalog();

    const key = `${this.input.baseUrl}\u0000${this.input.apiId}\u0000${this.input.currency}\u0000${this.input.currencyDecimals}`;
    const existing = sharedCatalogs.get(key);
    if (!forceRefresh && existing && existing.expiresAt > Date.now()) {
      this.catalogPromise = existing.promise;
      return existing.promise;
    }

    const promise = this.loadCatalog();
    sharedCatalogs.set(key, { expiresAt: Date.now() + LEGACY_CATALOG_CACHE_TTL_MS, promise });
    this.catalogPromise = promise;
    try {
      return await promise;
    } catch (error) {
      if (sharedCatalogs.get(key)?.promise === promise) sharedCatalogs.delete(key);
      if (this.catalogPromise === promise) this.catalogPromise = undefined;
      throw error;
    }
  }

  private async loadInstanceCatalog() {
    const promise = this.loadCatalog();
    this.catalogPromise = promise;
    try {
      return await promise;
    } catch (error) {
      if (this.catalogPromise === promise) this.catalogPromise = undefined;
      throw error;
    }
  }

  private async loadCatalog() {
    const categories = z.array(categorySchema).parse(await this.request("/shared/commodity/items", {}, { maxResponseBytes: LEGACY_CATALOG_MAX_RESPONSE_BYTES }));
    return flattenItems(categories).map((item) => this.product(item));
  }

  private product(value: z.infer<typeof itemSchema>): SupplierProduct {
    const code = value.code ?? String(value.id ?? value.name);
    const price = value.user_price ?? value.factory_price ?? value.price ?? "0";
    const retailPriceMinor = value.price === undefined ? undefined : decimalToMinor(String(value.price), this.input.currencyDecimals);
    const memberPriceMinor = value.user_price === undefined ? undefined : decimalToMinor(String(value.user_price), this.input.currencyDecimals);
    const deliveryWay = value.delivery_way === null || value.delivery_way === undefined ? undefined : Number(value.delivery_way);
    return {
      id: code,
      name: value.name,
      description: value.description || value.introduce || "",
      imageUrls: value.cover || value.picture_url ? [resolveImageUrl(value.cover || value.picture_url || "", this.input.baseUrl)] : [],
      categoryNames: [],
      active: value.status === null || value.status === undefined || Number(value.status) === 1,
      skus: [{
        id: code,
        name: value.name,
        costMinor: decimalToMinor(String(price), this.input.currencyDecimals),
        ...(retailPriceMinor ? { retailPriceMinor } : {}),
        ...(memberPriceMinor ? { memberPriceMinor } : {}),
        stockQuantity: normalizeStock(value.stock),
        active: value.status === null || value.status === undefined || Number(value.status) === 1,
        purchaseContext: { code, ...(deliveryWay === undefined ? {} : { deliveryWay }) },
      }],
    };
  }

  private async request(path: string, data: Record<string, string> = {}, options: { maxResponseBytes?: number } = {}) {
    const requestData = { app_id: this.input.apiId, ...data };
    const form = new URLSearchParams(requestData);
    form.set("sign", signAcgForm(requestData, this.input.appKey));
    const { status, body } = await supplierFetchJson(this.input.fetcher ?? fetch, `${this.input.baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form.toString() }, { validateDestination: !this.input.fetcher, ...options });
    const envelope = z.object({ code: z.union([z.string(), z.number()]), msg: z.string().optional(), data: z.unknown().optional() }).parse(body);
    if (status !== 200 || Number(envelope.code) !== 200) throw new SupplierDomainError("acg_request_failed", 502, envelope.msg ?? "ACG request failed");
    return envelope.data;
  }
}

function flattenItems(value: unknown[]) {
  const result: Array<z.infer<typeof itemSchema>> = [];
  for (const node of value) {
    const parsed = z.object({ children: z.array(z.unknown()).default([]) }).passthrough().parse(node);
    if (parsed.children.length) result.push(...flattenItems(parsed.children));
    else {
      const item = itemSchema.safeParse(node);
      if (item.success) result.push(item.data);
    }
  }
  return result;
}

function normalizeStock(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === -1 || value === "-1") return 2_147_483_647;
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned invalid stock");
}

function parseCards(value: string, deliveryWay?: number) {
  const cards = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (deliveryWay === 0 && cards.length === 1 && /(等待|人工|发货|处理中|处理|稍后|联系)/.test(cards[0])) return [];
  if (cards.length > 10_000 || cards.some((card) => card.length > 64_000)) throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned invalid fulfillment");
  return cards;
}

function resolveImageUrl(value: string, baseUrl: string) {
  try { return new URL(value, baseUrl).toString(); } catch { return value; }
}
