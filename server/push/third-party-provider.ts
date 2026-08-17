export type ThirdPartyProviderConfig = {
  schemaVersion: 1;
  endpoint: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
  success: {
    field: string;
    value: string | number | boolean;
  };
  timeoutMs: number;
};

const templateVariables = new Set(["title", "content"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown) {
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) throw new Error("THIRD_PARTY_CONFIG_INVALID");
  return value as Record<string, string>;
}

function validateTemplate(value: unknown): unknown {
  if (typeof value === "string") {
    const variables = [...value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g)].map((match) => match[1]);
    if (variables.some((variable) => !variable || !templateVariables.has(variable))) throw new Error("THIRD_PARTY_CONFIG_INVALID");
    return value;
  }
  if (Array.isArray(value)) return value.map(validateTemplate);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, validateTemplate(item)]));
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  throw new Error("THIRD_PARTY_CONFIG_INVALID");
}

export function parseThirdPartyProviderConfig(json: string): ThirdPartyProviderConfig {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("THIRD_PARTY_CONFIG_INVALID"); }
  if (!isRecord(value) || value.schemaVersion !== 1 || value.method !== "POST") throw new Error("THIRD_PARTY_CONFIG_INVALID");
  if (typeof value.endpoint !== "string" || !/^https?:\/\//.test(value.endpoint)) throw new Error("THIRD_PARTY_CONFIG_INVALID");
  if (!isRecord(value.body) || !isRecord(value.success) || typeof value.success.field !== "string" || !value.success.field.trim()) throw new Error("THIRD_PARTY_CONFIG_INVALID");
  if (!["string", "number", "boolean"].includes(typeof value.success.value)) throw new Error("THIRD_PARTY_CONFIG_INVALID");
  const timeoutMs = value.timeoutMs === undefined ? 10_000 : value.timeoutMs;
  if (!Number.isInteger(timeoutMs) || Number(timeoutMs) < 1_000 || Number(timeoutMs) > 60_000) throw new Error("THIRD_PARTY_CONFIG_INVALID");
  return {
    schemaVersion: 1,
    endpoint: value.endpoint.trim(),
    method: "POST",
    headers: value.headers === undefined ? { "content-type": "application/json" } : stringRecord(value.headers),
    body: validateTemplate(value.body) as Record<string, unknown>,
    success: { field: value.success.field.trim(), value: value.success.value as string | number | boolean },
    timeoutMs: Number(timeoutMs),
  };
}

export function formatThirdPartyProviderConfig(config: ThirdPartyProviderConfig) {
  return JSON.stringify(config, null, 2);
}

function renderValue(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === "string") return value.replace(/{{\s*(title|content)\s*}}/g, (_, key: string) => variables[key] ?? "");
  if (Array.isArray(value)) return value.map((item) => renderValue(item, variables));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderValue(item, variables)]));
  return value;
}

function nestedValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
}

export async function sendThirdPartyPush(config: ThirdPartyProviderConfig, variables: { title: string; content: string }) {
  const body = renderValue(config.body, variables) as Record<string, unknown>;
  const contentType = Object.entries(config.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1]?.toLowerCase() ?? "application/json";
  const payload = contentType.includes("application/x-www-form-urlencoded")
    ? new URLSearchParams(Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)]))).toString()
    : JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(config.endpoint, { method: config.method, headers: config.headers, body: payload, signal: AbortSignal.timeout(config.timeoutMs), redirect: "follow" });
  } catch {
    throw new Error("THIRD_PARTY_SEND_RETRYABLE");
  }
  if (!response.ok) throw new Error(response.status === 429 || response.status >= 500 ? "THIRD_PARTY_SEND_RETRYABLE" : "THIRD_PARTY_SEND_FAILED");
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error("THIRD_PARTY_RESPONSE_INVALID"); }
  if (nestedValue(result, config.success.field) !== config.success.value) throw new Error("THIRD_PARTY_SEND_FAILED");
  const messageId = isRecord(result) && (typeof result.data === "object" && result.data !== null) && "pushid" in result.data
    ? String((result.data as Record<string, unknown>).pushid)
    : undefined;
  return { messageId };
}

export const serverChanExample = JSON.stringify({
  schemaVersion: 1,
  endpoint: "https://sctapi.ftqq.com/请替换为你的SENDKEY.send",
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: { title: "{{title}}", desp: "{{content}}" },
  success: { field: "code", value: 0 },
  timeoutMs: 10_000,
}, null, 2);
