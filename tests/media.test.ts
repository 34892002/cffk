import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/app-error.ts";
import { userErrorMessage } from "../lib/error-messages.ts";
import { isExpectedServerError } from "../server/error-handling.ts";
import { parseS3Config, type S3Config } from "../lib/config-schemas.ts";
import { detectedMime, isDeleteResponseSuccessful, normalizeMediaListQuery, normalizePath, validateMediaFile } from "../server/media/service.ts";
import { canonicalProxyRequest, cleanFileKey } from "../server/media/storage-client.ts";
import { deleteMediaCache, objectRequestUrl, proxyUrl, readMediaCache, storageFetchWithRetry, writeMediaCache } from "../server/media/storage-client.ts";

function errorCode(operation: () => unknown) {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : null;
  }
}

const validS3Config: S3Config = {
  schemaVersion: 2,
  endpoint: "https://s3.example.com",
  region: "auto",
  bucket: "cffk-media",
  pathPrefix: "media",
  cacheControl: "public, max-age=31536000, immutable",
  forcePathStyle: false,
};

test("media accepts only supported file signatures", () => {
  assert.equal(detectedMime(new Uint8Array([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(detectedMime(new TextEncoder().encode("GIF89a")), "image/gif");
  assert.equal(detectedMime(new TextEncoder().encode("%PDF-1.7")), "application/pdf");
  assert.equal(detectedMime(new TextEncoder().encode("<svg")), null);
  assert.equal(detectedMime(new TextEncoder().encode("ID3audio")), null);
  assert.equal(detectedMime(new TextEncoder().encode("\x00\x00\x00\x18ftypmp42")), null);
});

test("media upload validation rejects empty and mismatched files", async () => {
  await assert.rejects(() => validateMediaFile(new File([], "empty.png", { type: "image/png" })), /MEDIA_FILE_SIZE_INVALID/);
  await assert.rejects(() => validateMediaFile(new File([new TextEncoder().encode("GIF89a")], "wrong.png", { type: "image/png" })), /MEDIA_TYPE_NOT_ALLOWED/);
  await assert.rejects(() => validateMediaFile(new File([new TextEncoder().encode("<svg")], "icon.svg", { type: "image/svg+xml" })), /MEDIA_TYPE_NOT_ALLOWED/);
  const valid = await validateMediaFile(new File([new TextEncoder().encode("%PDF-1.7")], "document.pdf", { type: "application/pdf" }));
  assert.equal(valid.mime, "application/pdf");
});

test("media paths reject traversal and normalize separators", () => {
  assert.equal(normalizePath(" /catalog\\covers/ "), "catalog/covers");
  assert.throws(() => normalizePath("../private"), /MEDIA_PATH_INVALID/);
  assert.throws(() => normalizePath("catalog//covers"), /MEDIA_PATH_INVALID/);
  assert.throws(() => normalizePath("catalog/..\\private"), /MEDIA_PATH_INVALID/);
});

test("media list parameters are bounded and canonicalized", () => {
  assert.deepEqual(normalizeMediaListQuery({ page: 0, pageSize: 999, keyword: "  cover ", path: "/catalog\\covers/", mimeType: "image/" }), { page: 1, pageSize: 100, keyword: "cover", path: "catalog/covers", mimeType: "image/" });
  assert.deepEqual(normalizeMediaListQuery({ mimeType: "audio/" as never }), { page: 1, pageSize: 20, keyword: undefined, path: null, mimeType: undefined });
});

test("media delete treats S3 404 as idempotent", () => {
  assert.equal(isDeleteResponseSuccessful(new Response(null, { status: 204 })), true);
  assert.equal(isDeleteResponseSuccessful(new Response(null, { status: 404 })), true);
  assert.equal(isDeleteResponseSuccessful(new Response(null, { status: 500 })), false);
});

test("media proxy keys are safely decoded and canonicalized", () => {
  assert.equal(cleanFileKey("media/2026-08-09/name%20with%20space.webp"), "media/2026-08-09/name with space.webp");
  assert.equal(cleanFileKey("media/../private.webp"), null);
  const request = canonicalProxyRequest("media/name with space.webp", "https://shop.example/media/proxy/media/name%20with%20space.webp");
  assert.equal(request.url, "https://shop.example/media/proxy/media/name%20with%20space.webp");
});

test("media proxy URL encodes each file key segment", () => {
  assert.equal(proxyUrl("media/2026-08-09/name with space.webp"), "/media/proxy/media/2026-08-09/name%20with%20space.webp");
  assert.doesNotMatch(proxyUrl("media/a?b.webp"), /\?/);
});

test("S3 configuration requires version 2 non-secret settings", () => {
  const parsed = parseS3Config(JSON.stringify(validS3Config));
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.pathPrefix, "media");
  assert.throws(() => parseS3Config(JSON.stringify({ ...validS3Config, schemaVersion: 1 })));
  assert.throws(() => parseS3Config(JSON.stringify({ ...validS3Config, endpoint: "http://127.0.0.1" })));
  assert.throws(() => parseS3Config(JSON.stringify({ ...validS3Config, endpoint: "http://172.16.0.1" })));
  assert.throws(() => parseS3Config(JSON.stringify({ ...validS3Config, endpoint: "http://100.64.0.1" })));
  assert.throws(() => parseS3Config(JSON.stringify({ ...validS3Config, pathPrefix: "../private" })));
});

test("S3 object URLs support virtual-hosted and path-style addressing", () => {
  assert.equal(objectRequestUrl(validS3Config, "media/a file.pdf"), "https://cffk-media.s3.example.com/media/a%20file.pdf");
  assert.equal(objectRequestUrl({ ...validS3Config, forcePathStyle: true }, "media/a file.pdf"), "https://s3.example.com/cffk-media/media/a%20file.pdf");
});

test("storage retry stops on client errors and retries transient failures", async () => {
  let clientCalls = 0;
  const client = { fetch: async () => { clientCalls += 1; return new Response(null, { status: 404 }); } } as never;
  const notFound = await storageFetchWithRetry(client, "https://example.com/object", { method: "GET" });
  assert.equal(notFound.status, 404);
  assert.equal(clientCalls, 1);

  let retryCalls = 0;
  const retryClient = { fetch: async () => { retryCalls += 1; return new Response(null, { status: retryCalls < 3 ? 503 : 200 }); } } as never;
  const recovered = await storageFetchWithRetry(retryClient, "https://example.com/object", { method: "GET" });
  assert.equal(recovered.status, 200);
  assert.equal(retryCalls, 3);

  let networkCalls = 0;
  const failingClient = { fetch: async () => { networkCalls += 1; throw new Error("network failure"); } } as never;
  await assert.rejects(() => storageFetchWithRetry(failingClient, "https://example.com/object", { method: "GET" }), /network failure/);
  assert.equal(networkCalls, 3);
});

test("media cache helpers preserve hits and tolerate cache failures", async () => {
  const request = new Request("https://shop.example/media/proxy/media/file.webp");
  const cachedResponse = new Response("cached", { headers: { "content-type": "image/webp" } });
  let puts = 0;
  let deletes = 0;
  const cache = { match: async () => cachedResponse, put: async () => { puts += 1; }, delete: async () => { deletes += 1; return true; } } as never;
  assert.equal(await readMediaCache(cache, request), cachedResponse);
  await writeMediaCache(cache, request, new Response("origin"));
  await deleteMediaCache(cache, request);
  assert.equal(puts, 1);
  assert.equal(deletes, 1);
  const failingCache = { match: async () => undefined, put: async () => { throw new Error("cache unavailable"); }, delete: async () => { throw new Error("cache unavailable"); } } as never;
  await assert.doesNotReject(() => writeMediaCache(failingCache, request, new Response("origin")));
  await assert.doesNotReject(() => deleteMediaCache(failingCache, request));
});

test("Vike abort control flow is not reported as an unexpected error", () => {
  assert.equal(isExpectedServerError(Object.assign(new Error("AbortRender"), { name: "Error" })), true);
  assert.equal(isExpectedServerError(Object.assign(new Error("redirect"), { name: "AbortError" })), true);
});

test("media errors remain desensitized", () => {
  assert.equal(errorCode(() => { throw new AppError("MEDIA_TYPE_NOT_ALLOWED"); }), "MEDIA_TYPE_NOT_ALLOWED");
  assert.equal(userErrorMessage(new Error("S3 signature=secret-value")), "接口异常，请稍后重试。");
});
