export type SecretReference = { secret: string };

export type AlipayConfig = {
  mode: "web" | "face_to_face";
  appId: string;
  privateKey: SecretReference;
  alipayPublicKey: SecretReference;
  notifyUrl?: string;
  returnUrl?: string;
};

export type PaymentProviderConfig =
  | AlipayConfig
  | { gatewayUrl: string; merchantId: string; key: SecretReference; notifyUrl?: string }
  | { apiBaseUrl: string; token: SecretReference; notifyUrl?: string }
  | { publishableKey: string; secretKey: SecretReference; webhookSecret: SecretReference }
  | { endpoint: string; merchantId: string; apiKey: SecretReference; notifyUrl?: string };

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

function requireSecretReference(value: unknown, field: string): SecretReference {
  if (!isRecord(value)) throw new Error(`Invalid configuration: ${field} must reference a Worker Secret`);
  return { secret: requireString(value.secret, `${field}.secret`) };
}

export function parseAlipayConfig(json: string): AlipayConfig {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) throw new Error("Invalid Alipay configuration");
  if (value.mode !== "web" && value.mode !== "face_to_face") throw new Error("Invalid configuration: mode must be web or face_to_face");

  return {
    mode: value.mode,
    appId: requireString(value.appId, "appId"),
    privateKey: requireSecretReference(value.privateKey, "privateKey"),
    alipayPublicKey: requireSecretReference(value.alipayPublicKey, "alipayPublicKey"),
    ...(typeof value.notifyUrl === "string" ? { notifyUrl: value.notifyUrl } : {}),
    ...(typeof value.returnUrl === "string" ? { returnUrl: value.returnUrl } : {}),
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
    subject: requireString(value.subject, "subject"),
    body: requireString(value.body, "body"),
    format: value.format === "html" ? "html" : "text",
    ...(variables ? { variables } : {}),
  };
}

export function getWorkerSecret(env: Record<string, unknown>, reference: SecretReference): string {
  return requireString(env[reference.secret], `Worker Secret ${reference.secret}`);
}
