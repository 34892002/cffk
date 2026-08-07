const URL_PROTOCOLS = new Set(["http:", "https:"]);

function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`${field}_TOO_LONG`);
  return normalized;
}

function optionalUrl(value: unknown, field: string) {
  const normalized = optionalText(value, field, 2_048);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (!URL_PROTOCOLS.has(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${field}_INVALID`);
  }
}

export type SiteSettingsInput = {
  siteName: string;
  siteUrl?: string | null;
  siteSubtitle?: string | null;
  logo?: string | null;
  logoIcon?: string | null;
  notice?: string | null;
  supportContact?: string | null;
  footerText?: string | null;
  orderNotice?: string | null;
  headCode?: string | null;
  footerCode?: string | null;
  timezone: string;
};

export function validateSiteSettingsInput(input: SiteSettingsInput) {
  const siteName = String(input.siteName ?? "").trim();
  if (!siteName) throw new Error("SITE_NAME_REQUIRED");
  if (siteName.length > 120) throw new Error("SITE_NAME_TOO_LONG");

  const timezone = String(input.timezone ?? "").trim();
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: timezone }).format();
  } catch {
    throw new Error("SITE_TIMEZONE_INVALID");
  }

  return {
    siteName,
    siteUrl: optionalUrl(input.siteUrl, "SITE_URL"),
    siteSubtitle: optionalText(input.siteSubtitle, "SITE_SUBTITLE", 300),
    logo: optionalUrl(input.logo, "SITE_LOGO_URL"),
    logoIcon: optionalUrl(input.logoIcon, "SITE_FAVICON_URL"),
    notice: optionalText(input.notice, "SITE_NOTICE", 2_000),
    supportContact: optionalText(input.supportContact, "SITE_SUPPORT_CONTACT", 2_000),
    footerText: optionalText(input.footerText, "SITE_FOOTER_TEXT", 1_000),
    orderNotice: optionalText(input.orderNotice, "SITE_ORDER_NOTICE", 2_000),
    headCode: optionalText(input.headCode, "SITE_HEAD_CODE", 20_000),
    footerCode: optionalText(input.footerCode, "SITE_FOOTER_CODE", 20_000),
    timezone,
  };
}
