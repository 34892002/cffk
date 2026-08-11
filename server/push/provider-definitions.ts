import { parseEmailProviderConfig, type EmailProviderConfig } from "@/lib/config-schemas";

export type EmailProviderKind = "API" | "SMTP" | "CLOUDFLARE";
export type ProviderFormField = {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "password" | "url" | "switch" | "select" | "textarea";
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
  secret?: boolean;
  min?: number;
  max?: number;
};
export type ProviderFormDefinition = {
  channel: "EMAIL";
  provider: EmailProviderKind;
  schemaVersion: 1;
  title: string;
  fields: ProviderFormField[];
  capabilities: { messageTypes: ["NORMAL", "ADMIN"]; supportsTest: true };
  defaults: Record<string, string | number | boolean>;
};
export type SecretUpdate = { value?: string; keepExisting?: boolean; clear?: boolean };
export type SaveEmailProviderInput = {
  id?: number;
  channel: "EMAIL";
  provider: EmailProviderKind;
  name: string;
  isEnabled: boolean;
  values: Record<string, unknown>;
  secrets?: Record<string, SecretUpdate>;
};
export type MaskedSecret = { configured: boolean; masked?: string };

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

function resolveSecret(update: SecretUpdate | undefined, existing?: string) {
  if (update?.clear) return undefined;
  if (update?.value?.trim()) return update.value.trim();
  if (update?.keepExisting && existing) return existing;
  return undefined;
}

function existingSecret(json: string | undefined, kind: "api" | "smtp") {
  if (!json) return undefined;
  const existing = parseStoredEmailProviderConfig(json);
  if (kind === "api" && existing.kind === "api") return existing.apiKey;
  if (kind === "smtp" && existing.kind === "smtp") return existing.password;
  return undefined;
}

function normalizedConfig(config: EmailProviderConfig) {
  return { schemaVersion: 1 as const, ...config };
}

export function parseStoredEmailProviderConfig(json: string) {
  // Missing schemaVersion is the only accepted historical shape and is V1.
  const config = parseEmailProviderConfig(json);
  return normalizedConfig(config);
}

export function serializeEmailProviderConfig(input: SaveEmailProviderInput, existingJson?: string) {
  const values = input.values ?? {};
  let config: EmailProviderConfig;
  if (input.provider === "API") {
    const apiKey = resolveSecret(input.secrets?.apiKey, input.secrets?.apiKey?.keepExisting ? existingSecret(existingJson, "api") : undefined);
    config = { kind: "api", apiProvider: text(values, "apiProvider") === "RESEND" ? "RESEND" : "BREVO", endpoint: text(values, "endpoint"), apiKey: apiKey ?? "", from: text(values, "from"), ...(text(values, "fromName") ? { fromName: text(values, "fromName") } : {}), ...(text(values, "replyTo") ? { replyTo: text(values, "replyTo") } : {}), timeoutMs: number(values, "timeoutMs", 10000) };
  } else if (input.provider === "SMTP") {
    const password = resolveSecret(input.secrets?.password, input.secrets?.password?.keepExisting ? existingSecret(existingJson, "smtp") : undefined);
    const authType = text(values, "authType");
    config = { kind: "smtp", host: text(values, "host"), port: number(values, "port", 587), secure: bool(values, "secure"), username: text(values, "username"), password: password ?? "", ...(authType === "login" || authType === "cram-md5" || authType === "plain" ? { authType } : {}), from: text(values, "from"), ...(text(values, "fromName") ? { fromName: text(values, "fromName") } : {}), ...(text(values, "replyTo") ? { replyTo: text(values, "replyTo") } : {}) };
  } else {
    config = { kind: "cloudflare", from: text(values, "from"), ...(text(values, "fromName") ? { fromName: text(values, "fromName") } : {}), ...(text(values, "replyTo") ? { replyTo: text(values, "replyTo") } : {}) };
  }
  return JSON.stringify(normalizedConfig(parseEmailProviderConfig(JSON.stringify(config))));
}

export function maskedEmailProviderConfig(provider: EmailProviderKind, json: string) {
  const config = parseStoredEmailProviderConfig(json);
  const values: Record<string, unknown> = {
    from: config.from,
    fromName: config.fromName ?? "",
    replyTo: config.replyTo ?? "",
  };
  const secrets: Record<string, MaskedSecret> = {};
  if (provider === "API" && config.kind === "api") {
    Object.assign(values, { apiProvider: config.apiProvider ?? "BREVO", endpoint: config.endpoint, timeoutMs: config.timeoutMs ?? 10000 });
    secrets.apiKey = { configured: Boolean(config.apiKey), masked: config.apiKey ? "********" : undefined };
  } else if (provider === "SMTP" && config.kind === "smtp") {
    Object.assign(values, { host: config.host, port: config.port, secure: config.secure, username: config.username, authType: config.authType ?? "plain" });
    secrets.password = { configured: Boolean(config.password), masked: config.password ? "********" : undefined };
  } else if (provider !== "CLOUDFLARE" || config.kind !== "cloudflare") {
    throw new Error("EMAIL_PROVIDER_KIND_MISMATCH");
  }
  return { values, secrets };
}
