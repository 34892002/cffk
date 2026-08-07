import { eq } from "drizzle-orm";
import { deleteMedia, listMedia, uploadMedia } from "./service";
import { adminOperationLog, s3Config } from "@/database/drizzle/schema";
import { parseS3Config } from "@/lib/config-schemas";
import { appError } from "@/lib/app-error";
import { requireAdmin } from "@/server/telefunc-context";

export async function onGetS3Config() {
  const { db } = requireAdmin();
  const [record] = await db
    .select({ configJson: s3Config.configJson, updatedAt: s3Config.updatedAt })
    .from(s3Config)
    .where(eq(s3Config.id, 1))
    .limit(1);
  return record ?? null;
}

export async function onGetMedia(input: { page?: number; pageSize?: number } = {}) {
  const { database } = requireAdmin();
  return listMedia(database, input.page, input.pageSize);
}

export async function onUploadMedia(input: { originalName: string; dataUrl: string }) {
  const { database, runtime, db, adminUserId } = requireAdmin();
  const record = await uploadMedia(database, runtime, { ...input, uploadedBy: adminUserId });
  await db.insert(adminOperationLog).values({ adminUserId, action: "UPLOAD_MEDIA", targetType: "media", targetId: String(record.id), detail: `key=${record.fileKey}; size=${record.fileSize}`, createdAt: new Date() });
  return record;
}

export async function onDeleteMedia(input: { id: number }) {
  const { database, runtime, db, adminUserId } = requireAdmin();
  if (!Number.isInteger(input.id) || input.id < 1) appError("MEDIA_NOT_FOUND");
  const result = await deleteMedia(database, runtime, input.id);
  await db.insert(adminOperationLog).values({ adminUserId, action: "DELETE_MEDIA", targetType: "media", targetId: String(result.id), detail: "object deleted", createdAt: new Date() });
  return result;
}

export async function onSaveS3Config(input: { configJson: string }) {
  const { db, adminUserId } = requireAdmin();
  const configJson = input.configJson.trim();
  if (!configJson) appError("S3_CONFIG_REQUIRED");
  try {
    parseS3Config(configJson);
  } catch {
    appError("S3_CONFIG_INVALID");
  }

  const now = new Date();
  await db
    .insert(s3Config)
    .values({ id: 1, configJson, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: s3Config.id, set: { configJson, updatedAt: now } });
  await db.insert(adminOperationLog).values({
    adminUserId,
    action: "UPDATE_S3_CONFIG",
    targetType: "s3Config",
    targetId: "1",
    detail: "configuration updated",
    createdAt: now,
  });
  return { updatedAt: now };
}
