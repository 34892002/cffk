import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";
import { resolveHeadersLocale } from "@/lib/i18n/locale";
import { DEFAULT_FOOTER_TEXT, DEFAULT_SUPPORT_CONTACT, getSiteSettings, toPublicSiteSettings } from "@/server/site/public-settings";

export async function onBeforeRender(pageContext: PageContextServer) {
  const locale = resolveHeadersLocale(pageContext.headers as Record<string, string | undefined> | undefined);

  try {
    return { pageContext: { site: toPublicSiteSettings(await getSiteSettings(env.DB), locale), locale } };
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
        locale,
      },
    };
  }
}
