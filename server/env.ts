import { env as cloudflareEnv } from "cloudflare:workers";

type AppEnv = typeof cloudflareEnv & {
  ADMIN_PATH?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export const env = cloudflareEnv as AppEnv;
