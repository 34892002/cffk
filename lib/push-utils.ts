export function renderPushTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ""));
}

export function pushRetryDelayMs(attemptCount: number) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attemptCount - 1));
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
