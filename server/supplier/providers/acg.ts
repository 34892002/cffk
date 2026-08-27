import { z } from "zod";
import { SupplierDomainError } from "../error";
import { decimalToMinor } from "../money";
import type { SupplierPurchaseResult } from "../schema";
import { supplierFetchJson } from "./http";
import { signAcgForm } from "./signatures";
import type { SupplierAdapter, SupplierProduct, SupplierPurchaseContext } from "./types";


const widgetItemSchema = z.object({ name: z.string(), value: z.unknown().optional() });
const itemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().max(512),
  code: z.string().max(512).optional(),
  description: z.string().max(640_000).optional().default(""),
  introduce: z.string().max(640_000).optional(),
  cover: z.string().max(640_000).nullable().optional(),
  picture_url: z.string().max(640_000).nullable().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  user_price: z.union([z.string(), z.number()]).optional(),
  factory_price: z.union([z.string(), z.number()]).optional(),
  stock: z.union([z.string(), z.number()]).nullable().optional(),
  delivery_way: z.union([z.number(), z.string()]).nullable().optional(),
  status: z.union([z.number(), z.string()]).nullable().optional(),
  draft_status: z.union([z.number(), z.string()]).nullable().optional(),
  config: z.unknown().optional(),
  tags: z.preprocess(parseJsonArray, z.array(z.unknown()).optional()),
  widget: z.preprocess(parseJsonArray, z.array(widgetItemSchema).nullable().optional()),
});
const categorySchema: z.ZodType<unknown> = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().max(512),
  children: z.array(z.unknown()).default([]),
});

export class AcgAdapter implements SupplierAdapter {
  constructor(private readonly input: { baseUrl: string; apiId: string; appKey: string; currency: string; currencyDecimals: number; fetcher?: typeof fetch }) {}

  async testConnection() {
    const data = z.object({ username: z.string().optional(), balance: z.union([z.string(), z.number()]).optional() }).parse(await this.request("/shared/authentication/connect"));
    return { siteName: data.username ?? "ACG", balance: { amountMinor: decimalToMinor(String(data.balance ?? "0"), this.input.currencyDecimals), currency: this.input.currency } };
  }

  async listProducts(input: { page: number; pageSize: number }) {
    const data = z.array(categorySchema).parse(await this.request("/shared/commodity/items"));
    const products = await Promise.all(flattenItems(data).map(async (item) => {
      // The list endpoint omits category_factory. Enrich each item from the
      // detail endpoint so imported category SKUs get their real costs.
      if (item.code) {
        try {
          return this.product(itemSchema.parse(await this.request("/shared/commodity/item", { code: item.code })));
        } catch {
          // Older ACG deployments may not expose the detail endpoint.
        }
      }
      return this.product(item);
    }));
    const start = Math.max(0, (input.page - 1) * input.pageSize);
    return { total: products.length, products: products.slice(start, start + input.pageSize) };
  }

  async getSku(productId: string, skuId: string) {
    let product: SupplierProduct;
    try {
      const item = itemSchema.parse(await this.request("/shared/commodity/item", { code: productId }));
      product = this.product(item);
    } catch (itemError) {
      // Some ACG deployments expose the catalog but not the item endpoint.
      // The catalog has the same SKU fields required for a non-preselected SKU.
      const categories = z.array(categorySchema).parse(await this.request("/shared/commodity/items"));
      const fallback = flattenItems(categories).map((item) => this.product(item)).find((item) => item.id === productId || item.skus.some((sku) => sku.id === skuId));
      if (!fallback) throw itemError;
      product = fallback;
    }
    const sku = product.skus.find((value) => value.id === skuId);
    if (!sku) throw new SupplierDomainError("supplier_sku_not_found", 404, "Supplier SKU was not found");
    const context = sku.purchaseContext ?? {};
    const skuFields = context.sku ? Object.fromEntries(Object.entries(context.sku).map(([key, value]) => [`sku[${key}]`, value])) : {};
    const stock = z.object({ stock: z.union([z.string(), z.number()]).nullable().optional() }).parse(await this.request("/shared/commodity/stock", { code: context.code ?? productId, ...(context.race ? { race: context.race } : {}), ...skuFields }));
    return { ...sku, stockQuantity: normalizeStock(stock.stock) };
  }

  async quote(input: { skuId: string; quantity: number; purchaseContext?: SupplierPurchaseContext }) {
    const context = input.purchaseContext ?? {};
    const skuFields = context.sku ? Object.fromEntries(Object.entries(context.sku).map(([key, value]) => [`sku[${key}]`, value])) : {};
    const data = z.object({ price: z.union([z.string(), z.number()]) }).parse(await this.request("/shared/commodity/valuation", { code: context.code ?? input.skuId, num: String(input.quantity), ...(context.race ? { race: context.race } : {}), ...(context.cardId ? { card_id: String(context.cardId) } : {}), ...skuFields }));
    const unitCostMinor = decimalToMinor(String(data.price), this.input.currencyDecimals);
    return { unitCostMinor, totalCostMinor: (BigInt(unitCostMinor) * BigInt(input.quantity)).toString() };
  }

  async submitOrder(input: { skuId: string; quantity: number; requestNo: string; callbackUrl: string; traceId: string; purchaseContext?: SupplierPurchaseContext }): Promise<SupplierPurchaseResult> {
    const context = input.purchaseContext ?? {};
    const widget = context.widget ?? {};
    const skuFields = context.sku ? Object.fromEntries(Object.entries(context.sku).map(([key, value]) => [`sku[${key}]`, value])) : {};
    const data = z.object({ tradeNo: z.string().optional(), trade_no: z.string().optional(), amount: z.union([z.string(), z.number()]).optional(), secret: z.string().nullable().optional(), stock: z.union([z.string(), z.number()]).optional() }).parse(await this.request("/shared/commodity/trade", { shared_code: context.code ?? input.skuId, num: String(input.quantity), request_no: input.requestNo, contact: input.callbackUrl || "cffk", device: "0", ...(context.race ? { race: context.race } : {}), ...(context.cardId ? { card_id: String(context.cardId) } : {}), ...skuFields, ...widget }));
    const upstreamOrderId = data.tradeNo ?? data.trade_no;
    if (!upstreamOrderId) throw new SupplierDomainError("supplier_order_id_missing", 502, "ACG did not return a trade number");
    const cards = parseCards(data.secret ?? "", input.purchaseContext?.deliveryWay);
    return cards.length ? { status: "supplied", upstreamOrderId, cards } : { status: "processing", upstreamOrderId };
  }

  async reconcileOrder(input: { upstreamOrderId: string | null; skuId: string; quantity: number; requestNo: string; callbackUrl: string; traceId: string; purchaseContext?: SupplierPurchaseContext }): Promise<SupplierPurchaseResult> {
    if (!input.upstreamOrderId) return { status: "uncertain", upstreamOrderId: null, errorCode: "acg_order_id_missing" };
    const data = z.object({ secret: z.string().nullable().optional(), status: z.union([z.string(), z.number()]).optional() }).parse(await this.request("/shared/commodity/query", { tradeNo: input.upstreamOrderId }));
    const cards = parseCards(data.secret ?? "", input.purchaseContext?.deliveryWay);
    if (cards.length) return { status: "supplied", upstreamOrderId: input.upstreamOrderId, cards };
    return { status: "processing", upstreamOrderId: input.upstreamOrderId };
  }

  private product(value: z.infer<typeof itemSchema>, stockOverride?: string | number | null): SupplierProduct {
    const code = value.code ?? String(value.id ?? value.name);
    // ACG's factory_price is not necessarily the price charged by the
    // current API identity. The trade/valuation endpoint charges the member
    // price, so prefer the account-facing user price for catalog display and
    // publication snapshots. Live valuation remains authoritative at checkout.
    // `user_price` is the price available to this API identity and is the
    // only static price allowed to seed the purchase-cost limit. `price` is
    // public retail pricing; `factory_price` may belong to another pricing
    // tier and must never override the account-facing price.
    const memberPriceMinor = value.user_price == null ? undefined : decimalToMinor(String(value.user_price), this.input.currencyDecimals);
    const cost = value.user_price ?? value.price ?? "0";
    const retailPriceMinor = value.price == null ? undefined : decimalToMinor(String(value.price), this.input.currencyDecimals);
    const stock = stockOverride ?? value.stock;
    const active = isItemActive(value);
    const image = value.cover || value.picture_url;
    const baseContext = extractPurchaseContext(value.config, value.widget);
    const categoryPrices = extractCategoryPrices(value.config);
    const races = extractRaces(value.config);
    const skuBase = {
      costMinor: decimalToMinor(String(cost), this.input.currencyDecimals),
      ...(retailPriceMinor ? { retailPriceMinor } : {}),
      ...(memberPriceMinor ? { memberPriceMinor } : {}),
      stockQuantity: normalizeStock(stock),
      active,
    };
    // ACG represents category choices (for example 月费/季费/年费) as
    // separate purchasable SKUs. They share the product code, but each race
    // must remain selectable and must be sent to valuation/trade separately.
    const skus = races.length
      ? races.map((race) => ({
          ...skuBase,
          // category_factory is the actual per-category upstream cost exposed
          // by ACG (20/70/150 for 哈喽), unlike item.user_price which is only
          // the lowest generic member reference price.
          costMinor: categoryPrices[race] == null ? skuBase.costMinor : decimalToMinor(String(categoryPrices[race]), this.input.currencyDecimals),
          id: race,
          name: `${value.name} · ${race}`,
          purchaseContext: { ...baseContext, code, race, ...(value.delivery_way != null ? { deliveryWay: Number(value.delivery_way) } : {}) },
        }))
      : [{ ...skuBase, id: code, name: value.name, ...(baseContext || value.delivery_way != null ? { purchaseContext: { ...baseContext, code, ...(value.delivery_way != null ? { deliveryWay: Number(value.delivery_way) } : {}) } } : {}) }];
    return { id: code, name: value.name, description: value.description || value.introduce || "", imageUrls: image ? [resolveImageUrl(image, this.input.baseUrl)] : [], categoryNames: [], active, skus };
  }

  private async request(path: string, data: Record<string, string> = {}) {
    const requestData = { app_id: this.input.apiId, ...data };
    const form = new URLSearchParams(requestData);
    form.set("sign", signAcgForm(requestData, this.input.appKey));
    const { status, body } = await supplierFetchJson(this.input.fetcher ?? fetch, `${this.input.baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form.toString() }, { validateDestination: !this.input.fetcher });
    const envelope = z.object({ code: z.union([z.string(), z.number()]), msg: z.string().optional(), data: z.unknown().optional() }).parse(body);
    if (status !== 200 || Number(envelope.code) !== 200) {
      const message = (envelope.msg ?? "ACG request failed").trim().slice(0, 512);
      console.error("[supplier][acg] upstream request failed", {
        path,
        status,
        request: data,
        response: body,
      });
      throw new SupplierDomainError("acg_request_failed", 502, message);
    }
    return envelope.data;
  }
}

function flattenItems(value: unknown[]): Array<z.infer<typeof itemSchema>> {
  const result: Array<z.infer<typeof itemSchema>> = [];
  for (const node of value) {
    const parsed = z.object({ children: z.array(z.unknown()).default([]), name: z.string().optional() }).passthrough().parse(node);
    if (parsed.children.length) result.push(...flattenItems(parsed.children));
    else {
      const item = itemSchema.safeParse(node);
      if (item.success) result.push(item.data);
    }
  }
  return result;
}

function parseJsonArray(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  const result: Record<string, unknown> = {};
  let section = "";
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const item = line.slice(separator + 1).trim();
    if (section === "") result[key] = item;
    else if (section === "purchase" || section === "supplier") result[key] = item;
    else if (section === "category") {
      const category = (result.category && typeof result.category === "object" && !Array.isArray(result.category) ? result.category : {}) as Record<string, string>;
      category[key] = item;
      result.category = category;
      if (result.race === undefined) result.race = key;
    }
  }
  return result;
}

function extractRaces(value: unknown) {
  const config = parseConfig(value);
  if (config.category && typeof config.category === "object" && !Array.isArray(config.category)) return Object.keys(config.category).filter((item) => item.length > 0);
  return [];
}

function extractCategoryPrices(value: unknown): Record<string, string | number> {
  const config = parseConfig(value);
  if (!config.category_factory || typeof config.category_factory !== "object" || Array.isArray(config.category_factory)) return {};
  return Object.fromEntries(Object.entries(config.category_factory).filter(([, price]) => typeof price === "string" || typeof price === "number"));
}

function extractPurchaseContext(value: unknown, widgetValue: unknown) {
  const config = parseConfig(value);
  const context: { race?: string; sku?: Record<string, string>; cardId?: number; widget?: Record<string, string> } = {};
  if (typeof config.race === "string") context.race = config.race;
  else if (config.category && typeof config.category === "object" && !Array.isArray(config.category)) {
    const category = Object.keys(config.category);
    if (category[0]) context.race = category[0];
  }
  if (typeof config.card_id === "number" && Number.isInteger(config.card_id) && config.card_id > 0) context.cardId = config.card_id;
  if (config.sku && typeof config.sku === "object" && !Array.isArray(config.sku)) context.sku = stringRecord(config.sku);
  const widget = widgetValue ?? config.widget;
  if (Array.isArray(widget)) {
    const values = widget.filter((item): item is { name: string; value?: unknown } => Boolean(item) && typeof item === "object" && typeof (item as { name?: unknown }).name === "string");
    const record = Object.fromEntries(values.filter((item) => typeof item.value === "string").map((item) => [item.name, item.value as string]));
    if (Object.keys(record).length) context.widget = record;
  } else if (widget && typeof widget === "object") {
    const record = stringRecord(widget);
    if (Object.keys(record).length) context.widget = record;
  }
  return Object.keys(context).length ? context : undefined;
}

function stringRecord(value: object) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string")) as Record<string, string>;
}

function isItemActive(value: z.infer<typeof itemSchema>) {
  if (value.status != null) return Number(value.status) === 1;
  if (value.draft_status != null) return Number(value.draft_status) === 0;
  return value.delivery_way == null || Number(value.delivery_way) !== 0;
}

function resolveImageUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function normalizeStock(value: string | number | null | undefined) {
  if (value == null || value === -1 || value === "-1") return 2_147_483_647;
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned invalid stock");
}

function parseCards(value: string, deliveryWay?: number) {
  const cards = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  // ACG may put a human-delivery waiting message in `secret`. It is not
  // customer delivery content and must remain pending until query returns it.
  if (deliveryWay === 0 && cards.length === 1 && /(等待|人工|发货|处理中|处理|稍后|联系)/.test(cards[0])) return [];
  if (cards.length > 10_000 || cards.some((card) => card.length > 64_000)) throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned invalid fulfillment");
  return cards;
}
