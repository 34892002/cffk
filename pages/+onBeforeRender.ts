import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";
import { DEFAULT_FOOTER_TEXT, DEFAULT_SUPPORT_CONTACT, getSiteSettings, toPublicSiteSettings } from "@/server/site/public-settings";

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
          supportContact: DEFAULT_SUPPORT_CONTACT,
          footerText: DEFAULT_FOOTER_TEXT,
          orderNotice: null,
        },
      },
    };
  }
}
