import { eq } from "drizzle-orm";
import { user } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";

import { requireAdmin } from "@/server/telefunc-context";
import { env } from "@/server/env";

export async function onGetSecurityStatus() {
  const { db, adminUserId } = requireAdmin();
  const [admin] = await db.select({ username: user.username, email: user.email, twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, adminUserId)).limit(1);
  if (!admin) appError("ADMIN_NOT_FOUND");

  const turnstileSiteKey = env.TURNSTILE_SITE_KEY?.trim() || null;
  const turnstileSecretConfigured = Boolean(env.TURNSTILE_SECRET_KEY?.trim());
  return {
    username: admin.username ?? admin.email,
    twoFactorEnabled: admin.twoFactorEnabled,
    turnstile: {
      siteKey: turnstileSiteKey,
      enabled: Boolean(turnstileSiteKey && turnstileSecretConfigured),
      siteKeyConfigured: Boolean(turnstileSiteKey),
      secretConfigured: turnstileSecretConfigured,
    },
  };
}
