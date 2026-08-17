export const PUSH_MAX_ATTEMPTS = 3;

export function renderPushTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ""));
}

export function pushRetryDelayMs(attemptCount: number) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attemptCount - 1));
}

export function buildSmtpTransport(input: { host: string; port: number; secure: boolean; username?: string; password?: string; authType?: "plain" | "login" | "cram-md5" }) {
  return {
    host: input.host,
    port: input.port,
    secure: input.secure,
    credentials: input.username ? { username: input.username, password: input.password ?? "" } : undefined,
    authType: input.authType ?? "plain",
  };
}

export function buildSmtpMessage(input: { from: string; fromName?: string; to: string; replyTo?: string; subject: string; body: string }) {
  return {
    from: { email: input.from, ...(input.fromName ? { name: input.fromName } : {}) },
    to: input.to,
    reply: input.replyTo || undefined,
    subject: input.subject,
    text: input.body,
  };
}

export function smtpSendError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/Specified address is empty string, contains unsupported characters or is too long/i.test(message)) return "EMAIL_SMTP_HOST_INVALID";
  return /network|timeout|temporar|connection|socket/i.test(message) ? "EMAIL_SEND_RETRYABLE" : "EMAIL_SEND_FAILED";
}

export function parseEmailApiSuccessResponse(body: string, maxLength = 64 * 1024) {
  if (body.length > maxLength) throw new Error("EMAIL_SEND_FAILED");
  if (!body.trim()) return {};
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const payload = value as Record<string, unknown>;
    const messageId = typeof payload.id === "string" ? payload.id : typeof payload.messageId === "string" ? payload.messageId : undefined;
    return messageId ? { messageId } : {};
  } catch {
    return {};
  }
}
