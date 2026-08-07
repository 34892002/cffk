import { env as cloudflareEnv } from "cloudflare:workers";

type AppEnv = typeof cloudflareEnv & {
  ADMIN_PATH?: string;
};

export const env = cloudflareEnv as AppEnv;
