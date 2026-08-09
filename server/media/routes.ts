import { eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { createDrizzleDb } from "@/database/drizzle";
import { media } from "@/database/drizzle/schema";
import { errorCode } from "@/lib/app-error";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { isRoot } from "@/server/admin";
import { getRequestSession } from "@/server/better-auth-handler";
import { canonicalProxyRequest, cleanFileKey, objectRequestUrl, readMediaCache, storageFetchWithRetry, writeMediaCache } from "./storage-client";
import { getMediaConfig, uploadMedia } from "./service";

const MAX_REQUEST_BYTES = 20 * 1024 * 1024 + 1024 * 1024;
type Bindings = Record<string, unknown> & { DB: D1Database };
function body(code: string, message: string, data: unknown = null) { return { code, message, data }; }
async function requireRoot(context: Context<{ Bindings: Bindings }>): Promise<{ id: string } | null | false> {
  const runtime = context.env as unknown as RuntimeAdapter;
  const session = await getRequestSession(context.req.raw, runtime);
  if (!session?.user) return null;
  return (await isRoot(runtime, session.user.id)) ? { id: session.user.id } : false;
}

export function registerMediaRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post("/api/media/upload", async (context: Context<{ Bindings: Bindings }>) => {
    const user = await requireRoot(context);
    if (user === false) return context.json(body("ADMIN_ACCESS_REQUIRED", "管理员身份已失效，请重新登录。"), 403);
    if (!user) return context.json(body("AUTH_REQUIRED", "请先登录后再继续操作。"), 401);
    const contentLength = Number(context.req.header("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return context.json(body("MEDIA_FILE_SIZE_INVALID", "文件大小超出限制。"), 400);
    const mediaConfig = await getMediaConfig(context.env.DB, context.env);
    if (!mediaConfig.configured || !mediaConfig.credentialStatus.accessKeyConfigured || !mediaConfig.credentialStatus.secretKeyConfigured) return context.json(body("S3_CREDENTIALS_UNAVAILABLE", "媒体存储凭据不可用，请先在媒体存储配置中填写访问密钥。"), 503);
    const form = await context.req.formData();
    const file = form.get("file");
    const path = form.get("path");
    if (!(file instanceof File) || (path !== null && typeof path !== "string")) return context.json(body("MEDIA_UPLOAD_INVALID", "上传文件无效。"), 400);
    try { const data = await uploadMedia(context.env.DB, context.env, { file, path: path ?? undefined, uploadedBy: user.id }); return context.json(body(0 as unknown as string, "文件上传成功。", { id: data.id, originalName: data.originalName, url: data.url })); }
    catch (error) { const code = errorCode(error); return context.json(body(code, "文件上传失败，请检查文件和存储配置。"), 400); }
  });
  app.delete("/api/media/:id", async (context: Context<{ Bindings: Bindings }>) => {
    const user = await requireRoot(context);
    if (user === false) return context.json(body("ADMIN_ACCESS_REQUIRED", "管理员身份已失效，请重新登录。"), 403);
    if (!user) return context.json(body("AUTH_REQUIRED", "请先登录后再继续操作。"), 401);
    const id = Number(context.req.param("id"));
    if (!Number.isInteger(id) || id < 1) return context.json(body("MEDIA_NOT_FOUND", "媒体文件不存在。"), 404);
    try {
      const { deleteMedia } = await import("./service");
      const result = await deleteMedia(context.env.DB, context.env, id, { cache: (caches as unknown as { default: Cache }).default, cacheOrigin: context.req.url });
      return context.json(body(0 as unknown as string, "媒体文件已删除。", result));
    } catch (error) {
      return context.json(body(errorCode(error), "媒体文件删除失败，请稍后重试。"), 400);
    }
  });
  app.get("/media/proxy/*", async (context: Context<{ Bindings: Bindings }>) => {
    const request = context.req.raw;
    if (new URL(request.url).search) return context.text("Not Found", 404);
    const wildcard = context.req.param("*");
    const fileKey = cleanFileKey(wildcard ?? "");
    if (!fileKey) return context.text("Not Found", 404);
    const [record] = await createDrizzleDb(context.env.DB).select().from(media).where(eq(media.fileKey, fileKey)).limit(1);
    if (!record) return context.text("Not Found", 404);
    const cache = (caches as unknown as { default: Cache }).default;
    const cached = await readMediaCache(cache, canonicalProxyRequest(fileKey, request.url));
    if (cached) return cached;
    const { config, client } = await (await import("./service")).storage(context.env.DB, context.env);
    const response = await storageFetchWithRetry(client, objectRequestUrl(config, record.fileKey), { method: "GET" });
    if (response.status === 404) return context.text("Not Found", 404);
    if (response.status === 403) return context.text("Bad Gateway", 502);
    if (!response.ok) return context.text("Bad Gateway", 502);
    const bytes = await response.arrayBuffer();
    const headers = new Headers({ "content-type": record.mimeType, "content-length": String(bytes.byteLength), "cache-control": config.cacheControl, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`, "x-content-type-options": "nosniff" });
    const etag = response.headers.get("etag"); if (etag) headers.set("etag", etag);
    const result = new Response(bytes, { headers });
    context.executionCtx.waitUntil(writeMediaCache(cache, canonicalProxyRequest(fileKey, request.url), result));
    return result;
  });
}
