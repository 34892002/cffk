import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";
import { getSiteSettings, toPublicSiteSettings } from "@/server/site/public-settings";

export async function onBeforeRender(_pageContext: PageContextServer) {
  try {
    return { pageContext: { site: toPublicSiteSettings(await getSiteSettings(env.DB)) } };
  } catch {
    return {
      pageContext: {
        site: {
          name: "CFFK-Shop",
          subtitle: null,
          siteUrl: null,
          logo: null,
          logoIcon: null,
          notice: null,
          supportContact: null,
          footerText: null,
          orderNotice: null,
        },
      },
    };
  }
}
