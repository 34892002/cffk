export type SecretReference = { secret: string };

export type AlipayMode = "web" | "face_to_face";

export type AlipayConfig = {
  schemaVersion: 1;
  modes: AlipayMode[];
  baseUrl: string;
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  notifyUrl: string;
  returnUrl: string;
};

export type EpayConfig = {
  schemaVersion: 1;
  baseUrl: string;
  pid: string;
  key: string;
  epayChannels: Array<"alipay" | "wxpay">;
  notifyUrl: string;
  returnUrl: string;
};

export type BepusdtConfig = {
  schemaVersion: 1;
  baseUrl: string;
  appSecret: string;
  notifyUrl: string;
  returnUrl: string;
};

export type StripeConfig = {
  schemaVersion: 1;
  secretKey: string;
  webhookSecret: string;
  currency: string;
  notifyUrl: string;
  returnUrl: string;
};

export type HashpayConfig = {
  schemaVersion: 1;
  baseUrl: string;
  merchantId: string;
  privateKey: string;
  currency: string;
  notifyUrl: string;
  returnUrl: string;
};

export type PaymentProviderConfig = AlipayConfig | EpayConfig | BepusdtConfig | StripeConfig | HashpayConfig;

export type EmailProviderConfig =
  | { kind: "smtp"; host: string; port: number; secure: boolean; username: string; password: SecretReference; authType?: "plain" | "login" | "cram-md5"; from: string; fromName?: string; replyTo?: string }
  | { kind: "api"; endpoint: string; apiKey: SecretReference; apiProvider?: "BREVO" | "RESEND"; from: string; fromName?: string; replyTo?: string; timeoutMs?: number }
  | { kind: "cloudflare"; binding: string; from: string; fromName?: string; replyTo?: string; destination?: string; allowedDestinations?: string[] };

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: SecretReference;
  secretAccessKey: SecretReference;
  publicBaseUrl?: string;
  forcePathStyle?: boolean;
};

export type EmailTemplateConfig = {
  subject: string;
  body: string;
  format: "text" | "html";
  variables?: string[];
};

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid configuration: ${field} must be a non-empty string`);
  return value;
}

function normalizeTemplateText(value: string) {
  return value.replace(/\\n/g, "\n");
}

function requireSecretReference(value: unknown, field: string): SecretReference {
  if (!isRecord(value)) throw new Error(`Invalid configuration: ${field} must reference a Worker Secret`);
  return { secret: requireString(value.secret, `${field}.secret`) };
}

function requireSchemaVersion(value: JsonObject, field: string) {
  if (value.schemaVersion !== 1) throw new Error(`Invalid configuration: ${field} must be 1`);
}

function requireUrl(value: unknown, field: string, allowEmpty = false) {
  const text = allowEmpty && value === "" ? "" : requireString(value, field);
  if (text) {
    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`Invalid configuration: ${field} must be an HTTP or HTTPS URL`);
    }
  }
  return text;
}

function requireStringArray(value: unknown, field: string, allowed: readonly string[], min = 0) {
  if (!Array.isArray(value) || value.length < min || value.some((item) => typeof item !== "string" || !allowed.includes(item))) {
    throw new Error(`Invalid configuration: ${field} contains an unsupported value`);
  }
  return [...new Set(value)] as string[];
}

function parseJsonObject(json: string, name: string) {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error(`Invalid ${name} configuration`); }
  if (!isRecord(value)) throw new Error(`Invalid ${name} configuration`);
  return value;
}

export function parseAlipayConfig(json: string): AlipayConfig {
  const value = parseJsonObject(json, "Alipay");
  requireSchemaVersion(value, "schemaVersion");
  const modes = requireStringArray(value.modes, "modes", ["web", "face_to_face"], 1) as AlipayMode[];
  return {
    schemaVersion: 1,
    modes,
    baseUrl: requireUrl(value.baseUrl, "baseUrl"),
    appId: requireString(value.appId, "appId"),
    privateKey: requireString(value.privateKey, "privateKey"),
    alipayPublicKey: requireString(value.alipayPublicKey, "alipayPublicKey"),
    notifyUrl: requireUrl(value.notifyUrl, "notifyUrl", true),
    returnUrl: requireUrl(value.returnUrl, "returnUrl", true),
  };
}

export function parseEpayConfig(json: string): EpayConfig {
  const value = parseJsonObject(json, "Epay");
  requireSchemaVersion(value, "schemaVersion");
  return {
    schemaVersion: 1,
    baseUrl: requireUrl(value.baseUrl, "baseUrl"),
    pid: requireString(value.pid, "pid"),
    key: requireString(value.key, "key"),
    epayChannels: requireStringArray(value.epayChannels, "epayChannels", ["alipay", "wxpay"], 1) as EpayConfig["epayChannels"],
    notifyUrl: requireUrl(value.notifyUrl, "notifyUrl", true),
    returnUrl: requireUrl(value.returnUrl, "returnUrl", true),
  };
}

export function parseBepusdtConfig(json: string): BepusdtConfig {
  const value = parseJsonObject(json, "BEpusdt");
  requireSchemaVersion(value, "schemaVersion");
  return {
    schemaVersion: 1,
    baseUrl: requireUrl(value.baseUrl, "baseUrl"),
    appSecret: requireString(value.appSecret, "appSecret"),
    notifyUrl: requireUrl(value.notifyUrl, "notifyUrl", true),
    returnUrl: requireUrl(value.returnUrl, "returnUrl", true),
  };
}

export function parseStripeConfig(json: string): StripeConfig {
  const value = parseJsonObject(json, "Stripe");
  requireSchemaVersion(value, "schemaVersion");
  return {
    schemaVersion: 1,
    secretKey: requireString(value.secretKey, "secretKey"),
    webhookSecret: requireString(value.webhookSecret, "webhookSecret"),
    currency: requireString(value.currency, "currency").toLowerCase(),
    notifyUrl: requireUrl(value.notifyUrl, "notifyUrl", true),
    returnUrl: requireUrl(value.returnUrl, "returnUrl", true),
  };
}

export function parseHashpayConfig(json: string): HashpayConfig {
  const value = parseJsonObject(json, "HashPay");
  requireSchemaVersion(value, "schemaVersion");
  return {
    schemaVersion: 1,
    baseUrl: requireUrl(value.baseUrl, "baseUrl"),
    merchantId: requireString(value.merchantId, "merchantId"),
    privateKey: requireString(value.privateKey, "privateKey"),
    currency: requireString(value.currency, "currency").toUpperCase(),
    notifyUrl: requireUrl(value.notifyUrl, "notifyUrl", true),
    returnUrl: requireUrl(value.returnUrl, "returnUrl", true),
  };
}

export function parseEmailProviderConfig(json: string): EmailProviderConfig {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) throw new Error("Invalid email provider configuration");
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error("Invalid email provider configuration version");
  const from = requireString(value.from, "from");

  if (value.kind === "cloudflare") {
    return {
      kind: "cloudflare",
      binding: requireString(value.binding, "binding"),
      from,
      ...(typeof value.fromName === "string" && value.fromName.trim() ? { fromName: value.fromName.trim() } : {}),
      ...(typeof value.replyTo === "string" && value.replyTo.trim() ? { replyTo: value.replyTo.trim() } : {}),
      ...(typeof value.destination === "string" && value.destination.trim() ? { destination: value.destination.trim() } : {}),
      ...(Array.isArray(value.allowedDestinations) ? { allowedDestinations: value.allowedDestinations.filter((item): item is string => typeof item === "string" && item.trim().length > 0) } : {}),
    };
  }
  if (value.kind === "smtp") {
    if (typeof value.port !== "number" || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) {
      throw new Error("Invalid configuration: port must be a valid integer");
    }
    if (typeof value.secure !== "boolean") throw new Error("Invalid configuration: secure must be boolean");
    return {
      kind: "smtp",
      host: requireString(value.host, "host"),
      port: value.port,
      secure: value.secure,
      username: requireString(value.username, "username"),
      password: requireSecretReference(value.password, "password"),
      from,
      ...(value.authType === "login" || value.authType === "cram-md5" || value.authType === "plain" ? { authType: value.authType } : {}),
      ...(typeof value.fromName === "string" && value.fromName.trim() ? { fromName: value.fromName.trim() } : {}),
      ...(typeof value.replyTo === "string" && value.replyTo.trim() ? { replyTo: value.replyTo.trim() } : {}),
    };
  }
  if (value.kind === "api") {
    return {
      kind: "api",
      endpoint: requireString(value.endpoint, "endpoint"),
      apiKey: requireSecretReference(value.apiKey, "apiKey"),
      from,
      ...(value.apiProvider === "BREVO" || value.apiProvider === "RESEND" ? { apiProvider: value.apiProvider } : {}),
      ...(typeof value.fromName === "string" && value.fromName.trim() ? { fromName: value.fromName.trim() } : {}),
      ...(typeof value.replyTo === "string" && value.replyTo.trim() ? { replyTo: value.replyTo.trim() } : {}),
      ...(typeof value.timeoutMs === "number" && Number.isInteger(value.timeoutMs) && value.timeoutMs > 0 ? { timeoutMs: value.timeoutMs } : {}),
    };
  }
  throw new Error("Invalid configuration: kind must be smtp, api, or cloudflare");
}

export function parseS3Config(json: string): S3Config {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) throw new Error("Invalid S3 configuration");
  const endpoint = requireString(value.endpoint, "endpoint");
  try { new URL(endpoint); } catch { throw new Error("Invalid configuration: endpoint must be a URL"); }
  const publicBaseUrl = typeof value.publicBaseUrl === "string" && value.publicBaseUrl.trim() ? value.publicBaseUrl.trim().replace(/\/$/, "") : undefined;
  if (publicBaseUrl) {
    try { new URL(publicBaseUrl); } catch { throw new Error("Invalid configuration: publicBaseUrl must be a URL"); }
  }
  if (value.forcePathStyle !== undefined && typeof value.forcePathStyle !== "boolean") throw new Error("Invalid configuration: forcePathStyle must be boolean");
  return {
    endpoint,
    region: requireString(value.region, "region"),
    bucket: requireString(value.bucket, "bucket"),
    accessKeyId: requireSecretReference(value.accessKeyId, "accessKeyId"),
    secretAccessKey: requireSecretReference(value.secretAccessKey, "secretAccessKey"),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    ...(typeof value.forcePathStyle === "boolean" ? { forcePathStyle: value.forcePathStyle } : {}),
  };
}

export function parseEmailTemplateConfig(json: string): EmailTemplateConfig {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) throw new Error("Invalid email template configuration");
  const variables = value.variables;
  if (variables !== undefined && (!Array.isArray(variables) || variables.some((item) => typeof item !== "string"))) {
    throw new Error("Invalid configuration: variables must be an array of strings");
  }

  return {
    subject: normalizeTemplateText(requireString(value.subject, "subject")),
    body: normalizeTemplateText(requireString(value.body, "body")),
    format: value.format === "html" ? "html" : "text",
    ...(variables ? { variables } : {}),
  };
}

export function getWorkerSecret(env: Record<string, unknown>, reference: SecretReference): string {
  return requireString(env[reference.secret], `Worker Secret ${reference.secret}`);
}
