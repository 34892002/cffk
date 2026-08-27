import { signAcgForm } from "../server/supplier/providers/signatures";

const apiId = process.env.ACG_API_ID?.trim();
const appKey = process.env.ACG_APP_KEY;
const baseUrl = process.env.ACG_BASE_URL?.trim().replace(/\/$/, "");

if (!apiId || !appKey || !baseUrl) {
  throw new Error("请设置 ACG_API_ID、ACG_APP_KEY、ACG_BASE_URL 环境变量");
}

const url = `${baseUrl}/shared/authentication/connect`;
const form = new URLSearchParams({ app_id: apiId });
form.set("sign", signAcgForm({ app_id: apiId }, appKey));
const body = form.toString();
const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});

const raw = await response.text();
let parsed: unknown = raw;
try {
  parsed = JSON.parse(raw);
} catch {
  // 保留原始响应，便于判断是否命中错误页面或代理页面。
}

if (typeof parsed === "object" && parsed !== null) {
  const value = parsed as Record<string, unknown>;
  console.log(JSON.stringify({
    ok: response.ok,
    httpStatus: response.status,
    code: value.code,
    message: value.msg ?? value.message,
    data: value.data && typeof value.data === "object" ? {
      username: (value.data as Record<string, unknown>).username,
      balance: (value.data as Record<string, unknown>).balance,
    } : undefined,
  }, null, 2));
} else {
  console.log(JSON.stringify({ ok: response.ok, httpStatus: response.status, body: raw.slice(0, 500) }, null, 2));
}
