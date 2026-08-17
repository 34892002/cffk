import { parseEmailProviderConfig, type EmailProviderConfig } from "@/lib/config-schemas";
import { mergeJsonFormValues, redactJsonFormValues, validateJsonFormValues, type JsonFormFieldDefinition } from "@/lib/json-form-values";

export type EmailProviderKind = "API" | "SMTP" | "CLOUDFLARE";
export type ProviderFormField = JsonFormFieldDefinition;
export type ProviderFormDefinition = {
  channel: "EMAIL";
  provider: EmailProviderKind;
  schemaVersion: 1;
  title: string;
  fields: ProviderFormField[];
  capabilities: { messageTypes: ["NORMAL", "ADMIN"]; supportsTest: true };
  defaults: Record<string, string | number | boolean>;
};
export type SaveEmailProviderInput = {
  id?: number;
  channel: "EMAIL";
  provider: EmailProviderKind;
  name: string;
  isEnabled: boolean;
  values: Record<string, unknown>;
};

const capabilities: ProviderFormDefinition["capabilities"] = { messageTypes: ["NORMAL", "ADMIN"], supportsTest: true };

export const emailProviderDefinitions: ProviderFormDefinition[] = [
  {
    channel: "EMAIL", provider: "API", schemaVersion: 1, title: "API", capabilities,
    defaults: { apiProvider: "BREVO", endpoint: "https://api.brevo.com/v3/smtp/email", from: "", fromName: "", replyTo: "", timeoutMs: 10000 },
    fields: [
      { key: "apiProvider", label: "API 服务商", type: "select", required: true, options: [{ label: "Brevo", value: "BREVO" }, { label: "Resend", value: "RESEND" }] },
      { key: "endpoint", label: "API 地址", type: "url", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true, secret: true, description: "敏感值保存到 D1，保存后不再回显原文。" },
      { key: "from", label: "发件邮箱", type: "email", required: true },
      { key: "fromName", label: "发件人名称", type: "text" },
      { key: "replyTo", label: "回复邮箱", type: "email" },
      { key: "timeoutMs", label: "超时（毫秒）", type: "number", min: 1000, max: 60000 },
    ],
  },
  {
    channel: "EMAIL", provider: "SMTP", schemaVersion: 1, title: "SMTP", capabilities,
    defaults: { host: "", port: 587, secure: false, username: "", authType: "plain", from: "", fromName: "", replyTo: "" },
    fields: [
      { key: "host", label: "SMTP Host", type: "text", required: true },
      { key: "port", label: "SMTP Port", type: "number", required: true, min: 1, max: 65535, description: "端口 465 通常需要启用 SMTPS / SSL；587 通常不启用。" },
      { key: "secure", label: "使用 SMTPS / SSL", type: "switch", description: "QQ 邮箱使用 465 端口时必须启用。" },
      { key: "username", label: "SMTP 用户名", type: "text", required: true },
      { key: "password", label: "SMTP 密码 / 授权码", type: "password", required: true, secret: true, description: "QQ 邮箱请填写 SMTP 授权码。敏感值保存到 D1，保存后不再回显原文。" },
      { key: "authType", label: "认证方式", type: "select", required: true, options: [{ label: "PLAIN", value: "plain" }, { label: "LOGIN", value: "login" }, { label: "CRAM-MD5", value: "cram-md5" }] },
      { key: "from", label: "发件邮箱", type: "email", required: true },
      { key: "fromName", label: "发件人名称", type: "text" },
      { key: "replyTo", label: "回复邮箱", type: "email" },
    ],
  },
  {
    channel: "EMAIL", provider: "CLOUDFLARE", schemaVersion: 1, title: "Cloudflare Email Sending", capabilities,
    defaults: { from: "", fromName: "", replyTo: "" },
    fields: [
      { key: "from", label: "发件邮箱", type: "email", required: true },
      { key: "fromName", label: "发件人名称", type: "text" },
      { key: "replyTo", label: "回复邮箱", type: "email" },
    ],
  },
];

export function getEmailProviderDefinition(provider: EmailProviderKind) {
  const definition = emailProviderDefinitions.find((item) => item.provider === provider);
  if (!definition) throw new Error("EMAIL_PROVIDER_KIND_INVALID");
  return definition;
}

function text(values: Record<string, unknown>, key: string) {
  return typeof values[key] === "string" ? values[key].trim() : "";
}

function number(values: Record<string, unknown>, key: string, fallback: number) {
  const value = values[key];
  return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
}

function bool(values: Record<string, unknown>, key: string) {
  return values[key] === true;
}


function normalizedConfig(config: EmailProviderConfig) {
  return { schemaVersion: 1 as const, ...config };
}

export function parseStoredEmailProviderConfig(json: string) {
  // Missing schemaVersion is the only accepted historical shape and is V1.
  const config = parseEmailProviderConfig(json);
  return normalizedConfig(config);
}

export function parseEmailProviderConfigForKind(provider: EmailProviderKind, json: string) {
  const definition = getEmailProviderDefinition(provider);
  const config = parseStoredEmailProviderConfig(json);
  const expectedKind = provider === "API" ? "api" : provider === "SMTP" ? "smtp" : "cloudflare";
  if (config.kind !== expectedKind) throw new Error("EMAIL_PROVIDER_KIND_MISMATCH");
  const raw = rawEmailProviderValues(provider, json);
  const allowed = new Set(["schemaVersion", "kind", ...definition.fields.map((field) => field.key)]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new Error("EMAIL_PROVIDER_FIELD_INVALID");
  validateJsonFormValues(definition.fields, config as unknown as Record<string, unknown>);
  return config;
}

function rawEmailProviderValues(provider: EmailProviderKind, json?: string) {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    const expectedKind = provider === "API" ? "api" : provider === "SMTP" ? "smtp" : "cloudflare";
    return record.kind === expectedKind ? record : {};
  } catch {
    return {};
  }
}

export function serializeEmailProviderConfig(input: SaveEmailProviderInput, existingJson?: string) {
  const definition = getEmailProviderDefinition(input.provider);
  const values = mergeJsonFormValues(definition.fields, input.values ?? {}, rawEmailProviderValues(input.provider, existingJson));
  validateJsonFormValues(definition.fields, values);
  let config: EmailProviderConfig;
  if (input.provider === "API") {
    const apiProvider = text(values, "apiProvider") as "BREVO" | "RESEND";
    config = { kind: "api", apiProvider, endpoint: text(values, "endpoint"), apiKey: text(values, "apiKey"), from: text(values, "from"), ...(text(values, "fromName") ? { fromName: text(values, "fromName") } : {}), ...(text(values, "replyTo") ? { replyTo: text(values, "replyTo") } : {}), timeoutMs: number(values, "timeoutMs", 10000) };
  } else if (input.provider === "SMTP") {
    const authType = text(values, "authType");
    config = { kind: "smtp", host: text(values, "host"), port: number(values, "port", 587), secure: bool(values, "secure"), username: text(values, "username"), password: text(values, "password"), ...(authType === "login" || authType === "cram-md5" || authType === "plain" ? { authType } : {}), from: text(values, "from"), ...(text(values, "fromName") ? { fromName: text(values, "fromName") } : {}), ...(text(values, "replyTo") ? { replyTo: text(values, "replyTo") } : {}) };
  } else {
    config = { kind: "cloudflare", from: text(values, "from"), ...(text(values, "fromName") ? { fromName: text(values, "fromName") } : {}), ...(text(values, "replyTo") ? { replyTo: text(values, "replyTo") } : {}) };
  }
  return JSON.stringify(normalizedConfig(parseEmailProviderConfig(JSON.stringify(config))));
}

export function recoverEmailProviderFormValues(provider: EmailProviderKind, json: string) {
  const definition = getEmailProviderDefinition(provider);
  const stored = rawEmailProviderValues(provider, json);
  const redacted = redactJsonFormValues(definition.fields, stored);
  return { values: { ...definition.defaults, ...redacted.values }, configuredSecrets: redacted.configuredSecrets };
}

export function emailProviderFormValues(provider: EmailProviderKind, json: string) {
  const definition = getEmailProviderDefinition(provider);
  const config = parseEmailProviderConfigForKind(provider, json);
  const redacted = redactJsonFormValues(definition.fields, config as unknown as Record<string, unknown>);
  return { values: { ...definition.defaults, ...redacted.values }, configuredSecrets: redacted.configuredSecrets };
}
