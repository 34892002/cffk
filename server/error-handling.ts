import { AppError } from "@/lib/app-error";

type RequestSnapshot = {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string | string[]>;
  body: string | null;
};

type ErrorSnapshot = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return undefined;
  if (value instanceof Error) return errorSnapshot(value);
  if (Array.isArray(value)) return value.map((item) => toSerializable(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toSerializable(item, seen)]));
  }
  return String(value);
}

function errorSnapshot(cause: unknown): ErrorSnapshot {
  if (!(cause instanceof Error)) return { name: "NonErrorThrown", message: String(cause) };
  return {
    name: cause.name,
    message: cause.message,
    stack: cause.stack,
    ...("cause" in cause ? { cause: toSerializable(cause.cause) } : {}),
  };
}

function isVikeControlFlow(cause: unknown) {
  if (!(cause instanceof Error)) return false;
  return [cause.name, cause.message].some((value) => value === "AbortError" || value === "AbortRender");
}

export function isExpectedServerError(cause: unknown) {
  return cause instanceof AppError
    || isVikeControlFlow(cause)
    || (cause instanceof Error && /^[A-Z][A-Z0-9_:-]+$/.test(cause.message));
}

export async function captureRequest(request: Request): Promise<RequestSnapshot> {
  const url = new URL(request.url);
  let body: string | null = null;
  try {
    body = await request.clone().text();
  } catch (cause) {
    body = `[Unable to read request body: ${cause instanceof Error ? cause.message : String(cause)}]`;
  }

  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const previous = query[key];
    query[key] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
  }

  return {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    query,
    body,
  };
}

/**
 * The payload intentionally remains unmasked: Workers Observability is the
 * only approved destination for raw requests, provider responses and stacks.
 */
const reportedErrors = new WeakSet<object>();

export function reportUnexpectedServerError(scope: string, cause: unknown, details: Record<string, unknown> = {}) {
  if (isExpectedServerError(cause)) return;
  if (typeof cause === "object" && cause !== null) {
    if (reportedErrors.has(cause)) return;
    reportedErrors.add(cause);
  }
  console.error("Unhandled server error", {
    scope,
    error: errorSnapshot(cause),
    details: toSerializable(details),
  });
}

export async function reportUnexpectedRequestError(scope: string, cause: unknown, request: Request, details: Record<string, unknown> = {}) {
  if (isExpectedServerError(cause)) return;
  reportUnexpectedServerError(scope, cause, {
    request: await captureRequest(request),
    ...details,
  });
}

export async function withServerDataErrorHandling<T>(
  scope: string,
  pageContext: { urlPathname?: string; urlOriginal?: string; routeParams?: unknown; urlParsed?: unknown },
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    reportUnexpectedServerError(scope, cause, {
      page: {
        urlPathname: pageContext.urlPathname,
        urlOriginal: pageContext.urlOriginal,
        routeParams: pageContext.routeParams,
        urlParsed: pageContext.urlParsed,
      },
    });
    throw cause;
  }
}
