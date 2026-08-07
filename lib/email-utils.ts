export function renderEmailTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ""));
}

export function emailRetryDelayMs(attemptCount: number) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attemptCount - 1));
}
