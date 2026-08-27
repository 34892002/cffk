import { createHash, createHmac } from "node:crypto";
import type { SupplierProvider } from "../schema";

export function signAcgForm(
	input: Readonly<Record<string, string>>,
	appKey: string,
): string {
	const values = Object.entries(input)
		.filter(([key, value]) => key !== "sign" && value !== "")
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join("&");
	return md5(`${decodeURIComponent(values)}&key=${appKey}`);
}

export function signDujiaoNextRequest(input: {
	method: string;
	path: string;
	timestamp: string;
	rawBody: string;
	apiSecret: string;
}): string {
	if (!input.path.startsWith("/") || input.path.includes("?")) {
		throw new TypeError("Dujiao Next signing path must exclude the query");
	}
	const payload = [
		input.method.toUpperCase(),
		input.path,
		input.timestamp,
		md5(input.rawBody),
	].join("\n");
	return createHmac("sha256", input.apiSecret).update(payload).digest("hex");
}

export function signGmshopEdgeRequest(input: {
	method: string;
	pathWithQuery: string;
	timestamp: string;
	nonce: string;
	rawBody: string;
	apiSecret: string;
}): string {
	if (!input.pathWithQuery.startsWith("/"))
		throw new TypeError("GMShop Edge signing path must be absolute");
	const payload = [
		input.method.toUpperCase(),
		input.pathWithQuery,
		input.timestamp,
		input.nonce,
		createHash("sha256").update(input.rawBody).digest("hex"),
	].join("\n");
	return createHmac("sha256", input.apiSecret).update(payload).digest("hex");
}

export function providerRequestNumber(
	provider: SupplierProvider,
	supplierOrderId: string,
	accountId: string,
): string {
	const digest = createHash("sha256")
		.update(`${provider}\n${supplierOrderId}\n${accountId}`)
		.digest("hex");
	return provider === "acg" ? digest.slice(0, 24) : `gm_${digest.slice(0, 40)}`;
}

function md5(value: string): string {
	return createHash("md5").update(value).digest("hex");
}
