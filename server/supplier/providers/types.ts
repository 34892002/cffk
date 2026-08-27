import type { SupplierPurchaseResult } from "../schema";

export type SupplierBalance = {
	amountMinor: string;
	currency: string;
};

export type SupplierPurchaseContext = {
	/** ACG product code; distinct from the selected SKU id. */
	code?: string;
	race?: string;
	sku?: Record<string, string>;
	cardId?: number;
	widget?: Record<string, string>;
	deliveryWay?: number;
};

export type SupplierSku = {
	id: string;
	name: string;
	costMinor: string;
	/** Upstream public/retail price, for catalog display only. */
	retailPriceMinor?: string;
	/** Price exposed to the current supplier API identity, for display only. */
	memberPriceMinor?: string;
	/** Live price returned by the supplier valuation endpoint. */
	livePurchasePriceMinor?: string;
	stockQuantity: number;
	active: boolean;
	purchaseContext?: SupplierPurchaseContext;
};

export type SupplierProduct = {
	id: string;
	name: string;
	description: string;
	imageUrls: string[];
	categoryNames: string[];
	active: boolean;
	updatedAt?: string | null;
	skus: SupplierSku[];
};

export interface SupplierAdapter {
	testConnection(): Promise<{ siteName: string; balance: SupplierBalance }>;
	listProducts(input: {
		page: number;
		pageSize: number;
		updatedAfter?: string;
		includeInactive?: boolean;
		/** Bypass any provider catalog snapshot and fetch the latest upstream directory. */
		forceRefresh?: boolean;
	}): Promise<{ products: SupplierProduct[]; total: number }>;
	getSku(productId: string, skuId: string): Promise<SupplierSku>;
	quote?(input: {
		skuId: string;
		quantity: number;
		purchaseContext?: SupplierPurchaseContext;
	}): Promise<{ totalCostMinor: string; unitCostMinor: string }>;
	submitOrder(input: {
		skuId: string;
		quantity: number;
		requestNo: string;
		callbackUrl: string;
		traceId: string;
		purchaseContext?: SupplierPurchaseContext;
	}): Promise<SupplierPurchaseResult>;
	reconcileOrder(input: {
		upstreamOrderId: string | null;
		skuId: string;
		quantity: number;
		requestNo: string;
		callbackUrl: string;
		traceId: string;
		purchaseContext?: SupplierPurchaseContext;
	}): Promise<SupplierPurchaseResult>;
}
