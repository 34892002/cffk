export class SupplierDomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "SupplierDomainError";
    this.code = code;
    this.status = status;
  }
}

export function supplierError(code: string, status: number, message: string): SupplierDomainError {
  return new SupplierDomainError(code, status, message);
}

/**
 * Only errors that prove the configured account credentials are rejected may
 * quarantine the account. Product, stock, pricing, transport, and response
 * errors are not account failures and must remain retryable.
 */
const ACCOUNT_FAILURE_CODES = new Set([
  "supplier_account_auth_failed",
  "supplier_credentials_invalid",
  "invalid_api_key",
  "invalid_api_secret",
  "invalid_credentials",
  "authentication_failed",
]);

export function isSupplierAccountFailureCode(code: string) {
  // ACG currently exposes all upstream application failures through the
  // generic `acg_request_failed` code. Its human-readable message is not a
  // stable authentication signal, so never quarantine an account from it.
  return ACCOUNT_FAILURE_CODES.has(code);
}

export function isSupplierAccountFailure(cause: unknown) {
  if (!cause || typeof cause !== "object" || !("code" in cause) || typeof cause.code !== "string") return false;
  return isSupplierAccountFailureCode(cause.code);
}
