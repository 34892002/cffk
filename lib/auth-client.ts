import { createAuthClient } from "better-auth/vue";
import { twoFactorClient, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
      usernameClient(),
      twoFactorClient({
        onTwoFactorRedirect() {
          if (typeof window !== "undefined") window.location.assign(`${window.location.pathname.replace(/\/$/, "")}/two-factor`);
        },
      }),
    ],
});
