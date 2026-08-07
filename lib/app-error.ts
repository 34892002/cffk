export class AppError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

export function appError(code: string): never {
  throw new AppError(code);
}

export function errorCode(cause: unknown) {
  if (cause instanceof AppError) return cause.code;
  if (cause instanceof Error && /^[A-Z][A-Z0-9_:-]+$/.test(cause.message)) return cause.message;
  return "REQUEST_FAILED";
}
