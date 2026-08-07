import { eq } from "drizzle-orm";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { getDrizzleDb } from "@/database/drizzle";
import { siteSetting } from "@/database/drizzle/schema";

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// The public site URL is authoritative when a third-party CDN changes the
// request Host while proxying to a Cloudflare Worker custom-domain origin.
export async function getPublicAuthOrigin(runtime: RuntimeAdapter): Promise<string | undefined> {
  try {
    const [setting] = await getDrizzleDb(runtime)
      .select({ siteUrl: siteSetting.siteUrl })
      .from(siteSetting)
      .where(eq(siteSetting.id, 1))
      .limit(1);

    return setting?.siteUrl ? normalizeOrigin(setting.siteUrl) ?? undefined : undefined;
  } catch {
    return undefined;
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
