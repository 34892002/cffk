import { createHash, createHmac } from "node:crypto";

const baseUrl = process.env.DUJIAO_BASE_URL?.trim().replace(/\/$/, "");
const apiKey = process.env.DUJIAO_API_KEY?.trim();
const apiSecret = process.env.DUJIAO_API_SECRET;
if (!baseUrl || !apiKey || !apiSecret) throw new Error("请设置 DUJIAO_BASE_URL、DUJIAO_API_KEY、DUJIAO_API_SECRET 环境变量");

for (let page = 1; page <= 60; page += 1) {
  const result = await request(page);
  if (page < 60) {
    if (result.status !== 200 || !isRecord(result.body) || result.body.ok !== true) {
      console.log(JSON.stringify({ page, failed: true, statusCode: isRecord(result.body) ? result.body.status_code : undefined, message: isRecord(result.body) ? result.body.msg : undefined, summary: summarize(result.body) }));
      process.exitCode = 1;
      break;
    }
    continue;
  }
  console.log(JSON.stringify({ page, httpStatus: result.status, statusCode: isRecord(result.body) ? result.body.status_code : undefined, message: isRecord(result.body) ? result.body.msg : undefined, response: summarize(result.body) }, null, 2));
}

async function request(page: number) {
  const path = "/api/v1/upstream/products";
  const query = new URLSearchParams({ page: String(page), page_size: "50", include_inactive: "true" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", apiSecret!).update(["GET", path, timestamp, md5("")].join("\n")).digest("hex");
  const response = await fetch(`${baseUrl}${path}?${query}`, { headers: { Accept: "application/json", "Dujiao-Next-Api-Key": apiKey!, "Dujiao-Next-Timestamp": timestamp, "Dujiao-Next-Signature": signature } });
  const raw = await response.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status, body };
}
function summarize(value: unknown): unknown {
  if (typeof value === "string") return { type: "string", preview: value.slice(0, 300) };
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (!isRecord(value)) return { type: typeof value, value };
  return { keys: Object.keys(value), fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? { type: "array", length: item.length } : item && typeof item === "object" ? { type: "object", keys: Object.keys(item) } : { type: typeof item, value: item === null ? null : undefined }])) };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function md5(value: string) { return createHash("md5").update(value).digest("hex"); }
