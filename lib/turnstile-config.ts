export type TurnstileEnv = {
  TURNSTILE_SITE_KEY?: unknown;
  TURNSTILE_SECRET_KEY?: unknown;
};

export function getTurnstileConfig(values: object) {
  const bindings = values as TurnstileEnv;
  const siteKey = typeof bindings.TURNSTILE_SITE_KEY === "string" ? bindings.TURNSTILE_SITE_KEY.trim() : "";
  const secretKey = typeof bindings.TURNSTILE_SECRET_KEY === "string" ? bindings.TURNSTILE_SECRET_KEY.trim() : "";
  return {
    enabled: Boolean(siteKey && secretKey),
    siteKey: siteKey || null,
    secretKey: secretKey || null,
  };
}
