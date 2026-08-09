import { and, count, desc, eq, like, or } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { media, s3Config } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { parseS3Config, type S3Config } from "@/lib/config-schemas";
import { createStorageClient, objectRequestUrl, proxyUrl, storageFetchWithRetry } from "./storage-client";
import type { MediaConfigInput, MediaListQuery } from "./types";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MAX_BYTES: Record<string, number> = { image: 10 * 1024 * 1024, application: 20 * 1024 * 1024 };

type S3Credentials = { accessKeyId: string; secretAccessKey: string };
type StoredS3Config = { config: S3Config; credentials: S3Credentials };

export function normalizePath(value: string | undefined) {
  const path = (value ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (path.includes("..") || path.includes("//") || path.length > 255) appError("MEDIA_PATH_INVALID");
  return path || null;
}

export function normalizeMediaListQuery(input: MediaListQuery = {}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 20)));
  const keyword = input.keyword?.trim().slice(0, 255);
  const path = normalizePath(input.path);
  const mimeType = input.mimeType && ["image/", "application/pdf"].includes(input.mimeType) ? input.mimeType : undefined;
  return { page, pageSize, keyword, path, mimeType };
}

function detectedMime(bytes: Uint8Array) {
  const text = (n: number) => new TextDecoder().decode(bytes.slice(0, n));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (text(8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (text(6) === "GIF87a" || text(6) === "GIF89a") return "image/gif";
  if (text(4) === "RIFF" && text(12).slice(8) === "WEBP") return "image/webp";
  if (text(5) === "%PDF-") return "application/pdf";
  return null;
}

function maxFor(mime: string) {
  return MAX_BYTES[mime.split("/")[0]] ?? MAX_BYTES.application;
}

function configJson(input: MediaConfigInput) {
  return JSON.stringify({
    schemaVersion: 2,
    endpoint: input.endpoint,
    region: input.region || "auto",
    bucket: input.bucket,
    pathPrefix: input.pathPrefix || "media",
    cacheControl: input.cacheControl,
    forcePathStyle: input.forcePathStyle,
  });
}

function suppliedCredential(value: string | undefined) {
  return value?.trim() || undefined;
}

function credentialsFromRecord(record: { accessKeyId: string | null; secretAccessKey: string | null }): S3Credentials {
  const accessKeyId = suppliedCredential(record.accessKeyId ?? undefined);
  const secretAccessKey = suppliedCredential(record.secretAccessKey ?? undefined);
  if (!accessKeyId || !secretAccessKey) appError("S3_CREDENTIALS_UNAVAILABLE");
  return { accessKeyId, secretAccessKey };
}

async function storedConfig(database: D1Database): Promise<StoredS3Config> {
  const [record] = await createDrizzleDb(database).select().from(s3Config).where(eq(s3Config.id, 1)).limit(1);
  if (!record) appError("S3_CONFIG_NOT_FOUND");
  let config: S3Config;
  try {
    config = parseS3Config(record.configJson);
  } catch {
    appError("S3_CONFIG_INVALID");
  }
  return { config, credentials: credentialsFromRecord(record) };
}

export async function storage(database: D1Database, _runtime: Record<string, unknown>) {
  const { config, credentials } = await storedConfig(database);
  return { config, client: createStorageClient(config, credentials) };
}

export async function getMediaConfig(database: D1Database, _runtime: Record<string, unknown>) {
  const [record] = await createDrizzleDb(database).select().from(s3Config).where(eq(s3Config.id, 1)).limit(1);
  if (!record) return { configured: false, values: null, credentialStatus: { accessKeyConfigured: false, secretKeyConfigured: false }, updatedAt: null };
  try {
    const config = parseS3Config(record.configJson);
    return {
      configured: true,
      values: {
        endpoint: config.endpoint,
        region: config.region,
        bucket: config.bucket,
        pathPrefix: config.pathPrefix,
        cacheControl: config.cacheControl,
        forcePathStyle: config.forcePathStyle,
      },
      credentialStatus: {
        accessKeyConfigured: Boolean(suppliedCredential(record.accessKeyId ?? undefined)),
        secretKeyConfigured: Boolean(suppliedCredential(record.secretAccessKey ?? undefined)),
      },
      updatedAt: record.updatedAt.toISOString(),
    };
  } catch {
    return { configured: false, values: null, credentialStatus: { accessKeyConfigured: false, secretKeyConfigured: false }, updatedAt: record.updatedAt.toISOString() };
  }
}

export async function saveMediaConfig(database: D1Database, input: MediaConfigInput) {
  let json: string;
  try {
    json = configJson(input);
    parseS3Config(json);
  } catch {
    appError("S3_CONFIG_INVALID");
  }

  const db = createDrizzleDb(database);
  const [existing] = await db.select().from(s3Config).where(eq(s3Config.id, 1)).limit(1);
  const accessKeyId = suppliedCredential(input.accessKeyId) ?? suppliedCredential(existing?.accessKeyId ?? undefined);
  const secretAccessKey = suppliedCredential(input.secretAccessKey) ?? suppliedCredential(existing?.secretAccessKey ?? undefined);
  if (!accessKeyId || !secretAccessKey) appError("S3_CREDENTIALS_UNAVAILABLE");

  const now = new Date();
  await db.insert(s3Config).values({ id: 1, configJson: json, accessKeyId, secretAccessKey, createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: s3Config.id,
    set: { configJson: json, accessKeyId, secretAccessKey, updatedAt: now },
  });
  return { updatedAt: now.toISOString() };
}

export async function listMedia(database: D1Database, input: MediaListQuery = {}) {
  const { page, pageSize, keyword, path, mimeType } = normalizeMediaListQuery(input);
  const clauses = [];
  if (keyword) clauses.push(or(like(media.originalName, `%${keyword}%`), like(media.storedName, `%${keyword}%`))!);
  if (mimeType) clauses.push(like(media.mimeType, `${mimeType}%`));
  if (path) clauses.push(eq(media.path, path));
  const where = clauses.length ? and(...clauses) : undefined;
  const db = createDrizzleDb(database);
  const [totalRow] = await db.select({ total: count() }).from(media).where(where);
  const items = await db.select({ id: media.id, originalName: media.originalName, storedName: media.storedName, mimeType: media.mimeType, fileSize: media.fileSize, fileKey: media.fileKey, url: media.url, path: media.path, metadataJson: media.metadataJson, uploadedAt: media.uploadedAt }).from(media).where(where).orderBy(desc(media.uploadedAt), desc(media.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, total: totalRow?.total ?? 0, page, pageSize };
}

export async function validateMediaFile(file: File) {
  const name = file.name.trim();
  if (!name || name.length > 255) appError("MEDIA_NAME_REQUIRED");
  if (!file.size) appError("MEDIA_FILE_SIZE_INVALID");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectedMime(bytes);
  if (!mime || !MIME_EXTENSIONS[mime] || file.type !== mime || bytes.byteLength > maxFor(mime)) appError("MEDIA_TYPE_NOT_ALLOWED");
  return { name, bytes, mime };
}

export async function uploadMedia(database: D1Database, runtime: Record<string, unknown>, input: { file: File; path?: string; uploadedBy: string }) {
  const { name, bytes, mime } = await validateMediaFile(input.file);
  const { config, client } = await storage(database, runtime);
  const storedName = `${crypto.randomUUID()}.${MIME_EXTENSIONS[mime]}`;
  const key = `${config.pathPrefix}/${new Date().toISOString().slice(0, 10)}/${storedName}`;
  const put = await storageFetchWithRetry(client, objectRequestUrl(config, key), { method: "PUT", headers: { "content-type": mime, "content-length": String(bytes.byteLength) }, body: bytes });
  if (!put.ok) appError("S3_UPLOAD_FAILED");
  const now = new Date();
  try {
    const [row] = await createDrizzleDb(database).insert(media).values({ originalName: name, storedName, mimeType: mime, fileSize: bytes.byteLength, fileKey: key, url: proxyUrl(key), path: normalizePath(input.path), uploadedBy: input.uploadedBy, uploadedAt: now, updatedAt: now }).returning();
    return row!;
  } catch (error) {
    await client.fetch(objectRequestUrl(config, key), { method: "DELETE" });
    throw error;
  }
}

export async function deleteMedia(database: D1Database, runtime: Record<string, unknown>, id: number, options: { cache?: Cache; cacheOrigin?: string } = {}) {
  const db = createDrizzleDb(database);
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row) appError("MEDIA_NOT_FOUND");
  const { config, client } = await storage(database, runtime);
  const response = await storageFetchWithRetry(client, objectRequestUrl(config, row.fileKey), { method: "DELETE" });
  if (!isDeleteResponseSuccessful(response)) appError("S3_DELETE_FAILED");
  await db.delete(media).where(eq(media.id, id));
  if (options.cache && options.cacheOrigin) {
    try { await options.cache.delete(new Request(new URL(proxyUrl(row.fileKey), options.cacheOrigin))); } catch { /* Cache cleanup does not roll back a completed deletion. */ }
  }
  return { id };
}

export async function testMediaStorage(database: D1Database, _runtime: Record<string, unknown>, input?: MediaConfigInput) {
  let config: S3Config;
  let credentials: S3Credentials;
  if (input) {
    try {
      config = parseS3Config(configJson(input));
    } catch {
      appError("S3_CONFIG_INVALID");
    }
    const stored = await storedConfig(database).catch((error: unknown) => {
      if (suppliedCredential(input.accessKeyId) && suppliedCredential(input.secretAccessKey)) return null;
      throw error;
    });
    credentials = {
      accessKeyId: suppliedCredential(input.accessKeyId) ?? stored?.credentials.accessKeyId ?? "",
      secretAccessKey: suppliedCredential(input.secretAccessKey) ?? stored?.credentials.secretAccessKey ?? "",
    };
    if (!credentials.accessKeyId || !credentials.secretAccessKey) appError("S3_CREDENTIALS_UNAVAILABLE");
  } else {
    ({ config, credentials } = await storedConfig(database));
  }

  const client = createStorageClient(config, credentials);
  const key = `${config.pathPrefix}/.__cffk_probe/${crypto.randomUUID()}`;
  const url = objectRequestUrl(config, key);
  try {
    const put = await client.fetch(url, { method: "PUT", body: "probe" });
    const get = await client.fetch(url, { method: "GET" });
    const del = await client.fetch(url, { method: "DELETE" });
    if (!put.ok || !get.ok || !del.ok) appError("S3_TEST_FAILED");
    return { ok: true as const };
  } catch {
    appError("S3_TEST_FAILED");
  }
}

export function isDeleteResponseSuccessful(response: Response) {
  return response.ok || response.status === 404;
}

export { detectedMime };
