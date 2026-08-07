import { AwsClient } from "aws4fetch";
import { and, desc, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { media, s3Config } from "@/database/drizzle/schema";
import { getWorkerSecret, parseS3Config } from "@/lib/config-schemas";

type Runtime = Record<string, unknown>;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function objectUrl(config: ReturnType<typeof parseS3Config>, key: string) {
  if (config.publicBaseUrl) return `${normalizeBaseUrl(config.publicBaseUrl)}/${key}`;
  if (config.forcePathStyle) return `${normalizeBaseUrl(config.endpoint)}/${config.bucket}/${key}`;
  const endpoint = new URL(config.endpoint);
  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `/${key}`;
  return endpoint.toString();
}

function objectRequestUrl(config: ReturnType<typeof parseS3Config>, key: string) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (config.forcePathStyle) return `${normalizeBaseUrl(config.endpoint)}/${encodeURIComponent(config.bucket)}/${encodedKey}`;
  const endpoint = new URL(config.endpoint);
  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `/${encodedKey}`;
  return endpoint.toString();
}

async function getStorageClient(database: D1Database, runtime: Runtime) {
  const [record] = await createDrizzleDb(database).select({ configJson: s3Config.configJson }).from(s3Config).where(eq(s3Config.id, 1)).limit(1);
  if (!record) throw new Error("S3_CONFIG_NOT_FOUND");
  let config: ReturnType<typeof parseS3Config>;
  try { config = parseS3Config(record.configJson); } catch { throw new Error("S3_CONFIG_INVALID"); }
  try {
    return {
      config,
      client: new AwsClient({ accessKeyId: getWorkerSecret(runtime, config.accessKeyId), secretAccessKey: getWorkerSecret(runtime, config.secretAccessKey), region: config.region, service: "s3" }),
    };
  } catch { throw new Error("S3_SECRET_UNAVAILABLE"); }
}

function extensionForMimeType(mimeType: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mimeType] ?? "bin";
}

export function parseUploadDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value.trim());
  if (!match || !ALLOWED_MIME_TYPES.has(match[1])) throw new Error("MEDIA_TYPE_NOT_ALLOWED");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  if (!bytes.length || bytes.byteLength > MAX_FILE_SIZE) throw new Error("MEDIA_FILE_SIZE_INVALID");
  return { mimeType: match[1], bytes };
}

export async function uploadMedia(database: D1Database, runtime: Runtime, input: { originalName: string; dataUrl: string; uploadedBy: string }) {
  const originalName = input.originalName.trim().slice(0, 255);
  if (!originalName) throw new Error("MEDIA_NAME_REQUIRED");
  const { mimeType, bytes } = parseUploadDataUrl(input.dataUrl);
  const { config, client } = await getStorageClient(database, runtime);
  const storedName = `${crypto.randomUUID().replace(/-/g, "")}.${extensionForMimeType(mimeType)}`;
  const fileKey = `media/${new Date().toISOString().slice(0, 10)}/${storedName}`;
  const response = await client.fetch(objectRequestUrl(config, fileKey), { method: "PUT", headers: { "content-type": mimeType, "content-length": String(bytes.byteLength) }, body: bytes });
  if (!response.ok) throw new Error("S3_UPLOAD_FAILED");

  const now = new Date();
  const [record] = await createDrizzleDb(database).insert(media).values({ originalName, storedName, mimeType, fileSize: bytes.byteLength, fileKey, url: objectUrl(config, fileKey), uploadedBy: input.uploadedBy, uploadedAt: now, updatedAt: now }).returning();
  if (!record) throw new Error("MEDIA_RECORD_CREATE_FAILED");
  return record;
}

export async function listMedia(database: D1Database, page = 1, pageSize = 30) {
  const db = createDrizzleDb(database);
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const items = await db.select().from(media).orderBy(desc(media.uploadedAt), desc(media.id)).limit(safePageSize).offset((safePage - 1) * safePageSize);
  return { items, page: safePage, pageSize: safePageSize };
}

export async function deleteMedia(database: D1Database, runtime: Runtime, id: number) {
  const db = createDrizzleDb(database);
  const [record] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!record) throw new Error("MEDIA_NOT_FOUND");
  const { config, client } = await getStorageClient(database, runtime);
  const response = await client.fetch(objectRequestUrl(config, record.fileKey), { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error("S3_DELETE_FAILED");
  await db.delete(media).where(and(eq(media.id, id), eq(media.fileKey, record.fileKey)));
  return { id };
}
