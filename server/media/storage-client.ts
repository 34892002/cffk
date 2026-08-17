import { AwsClient } from "aws4fetch";
import { parseS3Config, type S3Config } from "@/lib/config-schemas";

export function objectRequestUrl(config: S3Config, key: string) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (config.forcePathStyle) return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodedKey}`;
  const endpoint = new URL(config.endpoint);
  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `/${encodedKey}`;
  return endpoint.toString();
}

export function proxyUrl(key: string) {
  return `/media/proxy/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function fileKeyFromProxyPath(pathname: string) {
  const prefix = "/media/proxy/";
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
}

export function cleanFileKey(value: string) {
  let decoded: string;
  try { decoded = value.split("/").map(decodeURIComponent).join("/"); } catch { return null; }
  if (!decoded || decoded.split("/").some((part) => !part || part === ".." || part.includes("\\"))) return null;
  return decoded;
}

export function canonicalProxyRequest(fileKey: string, requestUrl: string) {
  return new Request(new URL(proxyUrl(fileKey), requestUrl));
}

export async function readMediaCache(cache: Cache, request: Request) {
  return cache.match(request);
}

export async function writeMediaCache(cache: Cache, request: Request, response: Response) {
  try { await cache.put(request, response.clone()); } catch { /* Cache 不可用时仍返回源站内容。 */ }
}

export async function deleteMediaCache(cache: Cache, request: Request) {
  try { await cache.delete(request); } catch { /* Cache cleanup does not roll back a completed deletion. */ }
}

export function parseStoredS3Config(configJson: string) {
  return parseS3Config(configJson);
}

export function createStorageClient(config: S3Config, credentials: { accessKeyId: string; secretAccessKey: string }) {
  return new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    region: config.region,
    service: "s3",
  });
}

export async function storageFetchWithRetry(client: AwsClient, url: string, init: RequestInit) {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await client.fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  return response!;
}
