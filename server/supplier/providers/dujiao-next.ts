import { z } from "zod";
import { SupplierDomainError } from "../error";
import { decimalToMinor } from "../money";
import type { SupplierPurchaseResult } from "../schema";
import { supplierFetchJson } from "./http";
import { signDujiaoNextRequest } from "./signatures";
import type { SupplierAdapter, SupplierProduct, SupplierSku } from "./types";

const localizedSchema = z.record(z.string(), z.string()).nullable().transform((value) => value ?? {});
const stringArraySchema = (maxItemLength: number, maxItems: number) => z.array(z.string().max(maxItemLength)).max(maxItems).nullable().transform((value) => value ?? []);

const productSchema = z.object({
	id: z.number().int().positive(),
	slug: z.string().nullable().optional(),
	title: localizedSchema,
	description: localizedSchema,
	images: stringArraySchema(2048, 20),
	tags: stringArraySchema(512, 100),
	category_id: z.number().int().nonnegative().default(0),
	is_active: z.boolean(),
	updated_at: z.string().datetime({ offset: true }).nullable().optional(),
	skus: z
		.array(
			z.object({
				id: z.number().int().positive(),
				sku_code: z.string(),
				spec_values: z.record(z.string(), z.unknown()).nullable().transform((value) => value ?? {}),
				price_amount: z.string(),
				member_price: z.string().nullable().optional(),
				stock_quantity: z.number().int(),
				is_active: z.boolean(),
			}),
		)
		.max(10_000),
});
const productListSchema = z.preprocess((value) => {
	if (Array.isArray(value)) return { total: value.length, items: value };
	if (!isRecord(value)) return value;
	const items = value.items ?? value.products ?? value.list ?? value.records;
	const total = value.total ?? value.total_count ?? (Array.isArray(items) ? items.length : undefined);
	return { ...value, total, items };
}, z.object({
	total: z.number().int().nonnegative(),
	items: z.array(productSchema),
}));

export class DujiaoNextAdapter implements SupplierAdapter {
	private categoriesPromise?: Promise<Map<number, string>>;

	constructor(
		private readonly input: {
			baseUrl: string;
			apiKey: string;
			apiSecret: string;
			currency: string;
			currencyDecimals: number;
			fetcher?: typeof fetch;
			now?: () => number;
		},
	) {}

	async testConnection() {
		const body = await this.request("POST", "/api/v1/upstream/ping");
		const parsed = z
			.object({
				ok: z.literal(true),
				site_name: z.string(),
				balance: z.string(),
				currency: z.string(),
			})
			.parse(body);
		this.assertCurrency(parsed.currency);
		return {
			siteName: parsed.site_name,
			balance: {
				amountMinor: decimalToMinor(
					parsed.balance,
					this.input.currencyDecimals,
				),
				currency: parsed.currency,
			},
		};
	}

	async listProducts(input: {
		page: number;
		pageSize: number;
		updatedAfter?: string;
		includeInactive?: boolean;
	}) {
		const query = new URLSearchParams({
			page: String(input.page),
			page_size: String(Math.min(input.pageSize, 100)),
		});
		if (input.updatedAfter) query.set("updated_after", input.updatedAfter);
		if (input.includeInactive) query.set("include_inactive", "true");
		const categories = await this.categories();
		const body = await this.requestWithRetry("GET", `/api/v1/upstream/products?${query}`);
		const parsed = parseSuccess(body, productListSchema);
		return {
			total: parsed.total,
			products: parsed.items.map((product) => this.product(product, categories)),
		};
	}

	async getSku(productId: string, skuId: string) {
		const body = await this.request(
			"GET",
			`/api/v1/upstream/products/${encodeURIComponent(productId)}`,
		);
		const parsed = z
			.object({ ok: z.boolean(), product: productSchema })
			.parse(body);
		const sku = this.product(parsed.product, await this.categories()).skus.find(
			(item) => item.id === skuId,
		);
		if (!sku) throw notFound();
		return sku;
	}

	async submitOrder(input: {
		skuId: string;
		quantity: number;
		requestNo: string;
		callbackUrl: string;
		traceId: string;
	}): Promise<SupplierPurchaseResult> {
		const body = await this.request("POST", "/api/v1/upstream/orders", {
			sku_id: Number(input.skuId),
			quantity: input.quantity,
			downstream_order_no: input.requestNo,
			trace_id: input.traceId,
			callback_url: input.callbackUrl,
		});
		const parsed = z
			.object({
				ok: z.boolean(),
				order_id: z.number().int().positive().optional(),
				status: z.string().optional(),
				currency: z.string().optional(),
				error_code: z.string().optional(),
			})
			.parse(body);
		if (parsed.currency) this.assertCurrency(parsed.currency);
		if (!parsed.ok || !parsed.order_id) {
			return {
				status: "definitively_failed",
				errorCode: parsed.error_code ?? "supplier_order_rejected",
			};
		}
		return {
			status: "processing",
			upstreamOrderId: String(parsed.order_id),
		};
	}

	async reconcileOrder(input: {
		upstreamOrderId: string | null;
	}): Promise<SupplierPurchaseResult> {
		if (!input.upstreamOrderId) {
			return {
				status: "uncertain",
				upstreamOrderId: null,
				errorCode: "supplier_order_id_missing",
			};
		}
		const body = await this.request(
			"GET",
			`/api/v1/upstream/orders/${encodeURIComponent(input.upstreamOrderId)}`,
		);
		const parsed = z
			.object({
				ok: z.literal(true),
				order_id: z.number().int().positive(),
				order_no: z.string().optional(),
				status: z.string(),
				amount: z.string().optional(),
				currency: z.string().optional(),
				items: z.array(z.unknown()).optional(),
				fulfillment: z
					.object({
						status: z.string(),
						payload: z.string().default(""),
					 delivery_data: z.unknown().nullable().optional(),
					 delivered_at: z.string().optional(),
					})
					.nullable()
					.optional(),
			})
			.parse(body);
		if (parsed.fulfillment?.status === "delivered") {
			const cards = parsed.fulfillment.payload
				.split(/\r?\n/)
				.map((value) => value.trim())
				.filter(Boolean);
			if (cards.length > 10_000 || cards.some((card) => card.length > 64_000))
				throw providerError(null);
			return cards.length
				? {
						status: "supplied",
						upstreamOrderId: String(parsed.order_id),
						cards,
					}
				: {
						status: "uncertain",
						upstreamOrderId: String(parsed.order_id),
						errorCode: "supplier_delivery_empty",
					};
		}
		if (["cancelled", "failed", "refunded"].includes(parsed.status)) {
			return {
				status: "definitively_failed",
				errorCode: `supplier_order_${parsed.status}`,
			};
		}
		return { status: "processing", upstreamOrderId: String(parsed.order_id) };
	}

	async cancelOrder(upstreamOrderId: string) {
		const body = await this.request(
			"POST",
			`/api/v1/upstream/orders/${encodeURIComponent(upstreamOrderId)}/cancel`,
		);
		return z
			.object({
				ok: z.literal(true),
				order_id: z.number().int().positive(),
				status: z.string(),
			})
			.parse(body);
	}

	private product(
		value: z.infer<typeof productSchema>,
		categories: Map<number, string>,
	): SupplierProduct {
		return {
			id: String(value.id),
			name: localized(value.title),
			description: localized(value.description),
			imageUrls: value.images,
			categoryNames: [
				...(categories.get(value.category_id)
					? [categories.get(value.category_id) ?? ""]
					: []),
				...value.tags,
			],
			active: value.is_active,
			...(value.updated_at ? { updatedAt: value.updated_at } : {}),
			skus: value.skus.map(
				(sku): SupplierSku => ({
					id: String(sku.id),
					name: sku.sku_code || JSON.stringify(sku.spec_values),
					costMinor: decimalToMinor(
						sku.member_price ?? sku.price_amount,
						this.input.currencyDecimals,
					),
					stockQuantity:
						sku.stock_quantity < 0 ? 2_147_483_647 : sku.stock_quantity,
					active: sku.is_active,
				}),
			),
		};
	}

	private categories() {
		this.categoriesPromise ??= this.request(
			"GET",
			"/api/v1/upstream/categories",
		).then((body) => {
			const parsed = parseSuccess(body, z.object({
				categories: z.array(
					z.object({
							id: z.number().int().positive(),
							name: z.record(z.string(), z.string()).default({}),
						}),
				),
			}));
			return new Map(
				parsed.categories.map((category) => [
					category.id,
					localized(category.name),
				]),
			);
		});
		return this.categoriesPromise;
	}

	private async requestWithRetry(method: string, path: string, value?: unknown) {
		let lastError: unknown;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				return await this.request(method, path, value);
			} catch (error) {
				lastError = error;
				if (!(error instanceof SupplierDomainError) || !isRetryable(error) || attempt === 2) throw error;
				await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
			}
		}
		throw lastError;
	}

	private async request(method: string, path: string, value?: unknown) {
		const rawBody = value === undefined ? "" : JSON.stringify(value);
		const signPath = path.split("?")[0] ?? path;
		const timestamp = String(
			Math.floor((this.input.now?.() ?? Date.now()) / 1000),
		);
		let response: { status: number; body: unknown };
		try {
			response = await supplierFetchJson(
				this.input.fetcher ?? fetch,
				`${this.input.baseUrl}${path}`,
				{
					method,
					headers: {
						"Dujiao-Next-Api-Key": this.input.apiKey,
						"Dujiao-Next-Timestamp": timestamp,
						"Dujiao-Next-Signature": signDujiaoNextRequest({
							method,
							path: signPath,
							timestamp,
							rawBody,
							apiSecret: this.input.apiSecret,
						}),
						...(value === undefined ? {} : { "Content-Type": "application/json" }),
					},
					body: value === undefined ? undefined : rawBody,
				},
				{ validateDestination: !this.input.fetcher },
			);
		} catch (cause) {
			console.error("[supplier][dujiao_next] request failed", {
				method,
				path: signPath,
				status: cause instanceof SupplierDomainError ? cause.status : undefined,
				code: cause instanceof SupplierDomainError ? cause.code : undefined,
				message: cause instanceof Error ? cause.message : String(cause),
				error: cause,
			});
			throw cause;
		}
		const { status, body } = response;
		if (status !== 200) {
			console.error("[supplier][dujiao_next] non-200 response", { method, path: signPath, status, body });
			throw providerError(body);
		}
		if (isRecord(body) && body.status_code !== undefined && String(body.status_code) !== "200") {
			console.error("[supplier][dujiao_next] upstream business error", { method, path: signPath, status, body });
			throw providerError(body);
		}
		return body;
	}

	private assertCurrency(value: string) {
		if (value.toUpperCase() !== this.input.currency.toUpperCase()) {
			throw new SupplierDomainError(
				"supplier_currency_mismatch",
				502,
				"Supplier currency does not match its account",
			);
		}
	}
}

function localized(value: Record<string, string>) {
	return (
		value["zh-CN"] || value["en-US"] || Object.values(value).find(Boolean) || ""
	);
}

function parseSuccess<T extends z.ZodTypeAny>(body: unknown, schema: T): z.output<T> {
	const envelope = z
		.object({
			ok: z.boolean(),
			error_code: z.string().optional(),
			error_message: z.string().optional(),
		})
		.passthrough()
		.safeParse(body);
	if (envelope.success && !envelope.data.ok) {
		throw new SupplierDomainError(
			envelope.data.error_code ?? "supplier_request_failed",
			502,
			envelope.data.error_message ?? "Supplier request failed",
		);
	}
	const candidate = isRecord(body) && (isRecord(body.data) || Array.isArray(body.data)) ? body.data : body;
	const parsed = schema.safeParse(candidate);
	if (!parsed.success) {
		const details = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`).join("；");
		throw new SupplierDomainError(
			"invalid_supplier_response",
			502,
			`独角 Next 返回的数据格式无法识别：${details}`,
		);
	}
	return parsed.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRetryable(error: SupplierDomainError) {
	return error.status === 429 || /429|rate|limit|频率|限流|网关|gateway/i.test(`${error.code} ${error.message}`) || error.status >= 500;
}

function providerError(body: unknown) {
	const parsed = z
		.object({ error_code: z.string().optional(), error_message: z.string().optional(), status_code: z.union([z.number(), z.string()]).optional(), msg: z.string().optional() })
		.safeParse(body);
	const message = parsed.success ? (parsed.data.error_message ?? parsed.data.msg ?? "Supplier request failed") : "Supplier request failed";
	const code = parsed.success ? (parsed.data.error_code ?? `supplier_status_${parsed.data.status_code ?? "unknown"}`) : "supplier_request_failed";
	return new SupplierDomainError(
		/429|rate|limit|频率|限流/i.test(`${code} ${message}`) ? "supplier_rate_limited" : code,
		502,
		message,
	);
}

function notFound() {
	return new SupplierDomainError(
		"supplier_sku_not_found",
		404,
		"Supplier SKU was not found",
	);
}
