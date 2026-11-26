import type { RuntimeAdapter } from "@universal-middleware/core";
import { getSiteSettings } from "@/server/site/public-settings";

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// The configured public site URL is authoritative when a third-party CDN
// changes the request Host while proxying to a Cloudflare Worker custom domain.
// Never fall back to the request origin: auth emails must only link to the
// administrator-configured domain, so a forged Host header cannot poison
// password reset or verification links. Callers treat null as "not configured".
export async function resolveAuthOrigin(runtime: RuntimeAdapter): Promise<string | null> {
  if (runtime.runtime !== "workerd" || !runtime.env?.DB) return null;

  try {
    const setting = await getSiteSettings(runtime.env.DB as D1Database);
    return setting.siteUrl ? normalizeOrigin(setting.siteUrl) : null;
  } catch {
    return null;
  }
}

export function rewriteRequestOrigin(request: Request, origin: string): Request {
  const url = new URL(request.url);
  const rewrittenUrl = new URL(`${url.pathname}${url.search}`, origin);
  const headers = new Headers(request.headers);
  headers.set("host", rewrittenUrl.host);

  return new Request(rewrittenUrl, {
    method: request.method,
    headers,
    body: request.body,
    // Cloudflare Workers requires duplex when forwarding a request body.
    // @ts-expect-error Cloudflare Workers RequestInit extension
    duplex: "half",
  });
}

export function withAuthNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.append("Vary", "Cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
