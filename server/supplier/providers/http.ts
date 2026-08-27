import { SupplierDomainError } from "../error";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

type SupplierFetchOptions = {
  validateDestination?: boolean;
  maxResponseBytes?: number;
};

export async function supplierFetchJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  options: SupplierFetchOptions = {},
): Promise<{ status: number; body: unknown }> {
  const destination = new URL(url);
  if (destination.protocol !== "http:" && destination.protocol !== "https:") {
    throw new SupplierDomainError("supplier_destination_rejected", 400, "Supplier destination is not allowed");
  }
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SupplierDomainError("supplier_request_uncertain", 502, "Supplier request outcome is uncertain");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new SupplierDomainError("supplier_redirect_rejected", 502, "Supplier redirects are not allowed");
  }
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxResponseBytes) {
    throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned an invalid response");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxResponseBytes) {
    throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned an invalid response");
  }
  try {
    return { status: response.status, body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    throw new SupplierDomainError("invalid_supplier_response", 502, "Supplier returned an invalid response");
  }
}
