import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDrizzleDb } from "@/database/drizzle";
import { supplierAccount, supplierOrder } from "@/database/drizzle/schema";
import { completeSupplierOrderFromCallback } from "./process";
import { signDujiaoNextRequest } from "./providers/signatures";

const MAX_CALLBACK_BYTES = 1024 * 1024;
const MAX_TIMESTAMP_SKEW_SECONDS = 60;
const CALLBACK_SIGNING_PATH = "/api/v1/upstream/callback";
const callbackSchema = z.object({
  event: z.string().min(1).max(120).optional(),
  order_id: z.number().int().positive(),
  downstream_order_no: z.string().min(1).max(256),
  status: z.string().min(1).max(64),
  fulfillment: z.object({ status: z.string().max(64), payload: z.string().max(640_000) }).nullable().optional(),
  timestamp: z.number().int().optional(),
});

export async function handleDujiaoSupplierCallback(database: D1Database, accountId: string, request: Request, now = Date.now()) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_CALLBACK_BYTES) return response(false, "body_too_large", 413);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_CALLBACK_BYTES) return response(false, "body_too_large", 413);
  const timestampHeader = request.headers.get("Dujiao-Next-Timestamp") ?? "";
  const timestamp = Number(timestampHeader);
  const apiKey = request.headers.get("Dujiao-Next-Api-Key") ?? "";
  const signature = request.headers.get("Dujiao-Next-Signature") ?? "";
  if (!apiKey || !signature || !Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) return response(false, "authentication_failed");
  const db = createDrizzleDb(database);
  const [account] = await db.select().from(supplierAccount).where(and(eq(supplierAccount.id, accountId), eq(supplierAccount.provider, "dujiao_next"), eq(supplierAccount.protocolVersion, "dujiao_next_v1"))).limit(1);
  if (!account) return response(false, "authentication_failed");
  let credentials: { apiKey?: string; apiSecret?: string };
  try { credentials = JSON.parse(account.credentialsJson) as { apiKey?: string; apiSecret?: string }; } catch { return response(false, "authentication_failed"); }
  if (credentials.apiKey !== apiKey || !credentials.apiSecret) return response(false, "authentication_failed");
  const expected = signDujiaoNextRequest({ method: "POST", path: CALLBACK_SIGNING_PATH, timestamp: timestampHeader, rawBody, apiSecret: credentials.apiSecret });
  if (!constantTimeEqual(signature.toLowerCase(), expected.toLowerCase())) return response(false, "authentication_failed");
  let payload: z.infer<typeof callbackSchema>;
  try { payload = callbackSchema.parse(JSON.parse(rawBody)); } catch { return response(false, "invalid_payload"); }
  if (payload.timestamp !== undefined && payload.timestamp !== timestamp) return response(false, "timestamp_mismatch");
  const [task] = await db.select({ id: supplierOrder.id, upstreamOrderId: supplierOrder.upstreamOrderId, selectedCredentialsRevision: supplierOrder.selectedCredentialsRevision, state: supplierOrder.state }).from(supplierOrder).where(and(eq(supplierOrder.selectedAccountId, accountId), eq(supplierOrder.providerRequestNo, payload.downstream_order_no))).limit(1);
  if (!task || (task.upstreamOrderId !== null && task.upstreamOrderId !== String(payload.order_id)) || (task.selectedCredentialsRevision !== null && task.selectedCredentialsRevision !== account.credentialsRevision)) return response(false, "supplier_order_not_found");
  if (task.state === "supplied") return response(true, "received");
  if (["delivered", "completed", "fulfilled"].includes(payload.status.toLowerCase()) && payload.fulfillment?.status.toLowerCase() === "delivered") {
    const cards = payload.fulfillment.payload.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!cards.length) return response(false, "supplier_delivery_empty");
    await completeSupplierOrderFromCallback(database, task.id, String(payload.order_id), cards);
  }
  return response(true, "received");
}

function response(ok: boolean, message: string, status = 200) { return Response.json({ ok, message }, { status }); }
function constantTimeEqual(left: string, right: string) { let difference = left.length ^ right.length; const length = Math.max(left.length, right.length); for (let index = 0; index < length; index += 1) difference |= left.charCodeAt(index % Math.max(1, left.length)) ^ right.charCodeAt(index % Math.max(1, right.length)); return difference === 0; }
