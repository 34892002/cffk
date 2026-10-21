import type { PageContextServer } from "vike/types";
import { env } from "@/server/env";
import { resolveHeadersLocale } from "@/lib/i18n/locale";
import { buildLocalizedOptionalText, buildLocalizedText } from "@/lib/i18n/localized-text";
import { DEFAULT_FOOTER_TEXT, DEFAULT_SUPPORT_CONTACT, getSiteSettings, toPublicSiteSettings } from "@/server/site/public-settings";

export async function onBeforeRender(pageContext: PageContextServer) {
  const locale = resolveHeadersLocale(pageContext.headers as Record<string, string | undefined> | undefined);

  try {
    return { pageContext: { site: toPublicSiteSettings(await getSiteSettings(env.DB)), locale } };
  } catch {
    return {
      pageContext: {
        site: {
          name: "CFFK-Shop",
          subtitle: buildLocalizedOptionalText(null, {}, "subtitle"),
          siteUrl: null,
          logo: null,
          logoIcon: null,
          notice: buildLocalizedOptionalText(null, {}, "notice"),
          supportContact: buildLocalizedText(DEFAULT_SUPPORT_CONTACT, {}, "supportContact"),
          footerText: buildLocalizedText(DEFAULT_FOOTER_TEXT, {}, "footerText"),
          orderNotice: buildLocalizedOptionalText(null, {}, "orderNotice"),
        },
        locale,
      },
    };
  }
}
