export type TurnstileEnv = Record<string, unknown> & {
  TURNSTILE_SITE_KEY?: unknown;
  TURNSTILE_SECRET_KEY?: unknown;
};

export function getTurnstileConfig(values: TurnstileEnv) {
  const siteKey = typeof values.TURNSTILE_SITE_KEY === "string" ? values.TURNSTILE_SITE_KEY.trim() : "";
  const secretKey = typeof values.TURNSTILE_SECRET_KEY === "string" ? values.TURNSTILE_SECRET_KEY.trim() : "";
  return {
    enabled: Boolean(siteKey && secretKey),
    siteKey: siteKey || null,
    secretKey: secretKey || null,
  };
}
