import { createAuthClient } from "better-auth/vue";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        if (typeof window !== "undefined") window.location.assign("/two-factor");
      },
    }),
  ],
});
