export class AppError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

type TelefuncAbort = { abortValue?: unknown };

export function appError(code: string): never {
  throw new AppError(code);
}

export function errorCode(cause: unknown) {
  if (cause instanceof AppError) return cause.code;
  if (typeof cause === "object" && cause !== null && "abortValue" in cause) {
    const abortValue = (cause as TelefuncAbort).abortValue;
    if (typeof abortValue === "object" && abortValue !== null && "code" in abortValue && typeof abortValue.code === "string") return abortValue.code;
  }
  if (cause instanceof Error && /^[A-Z][A-Z0-9_:-]+$/.test(cause.message)) return cause.message;
  return "REQUEST_FAILED";
}
