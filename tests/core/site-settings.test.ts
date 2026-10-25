// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { validateSiteSettingsInput } from "../../lib/validators/site";
import { proxyUrl } from "../../server/media/storage-client";
import { toPublicSiteSettings } from "../../server/site/public-settings";

const baseInput = { siteName: "Shop", timezone: "Asia/Shanghai" };
const mediaUrl = proxyUrl("media/2026-10-25/d55ab2cb-8c79-42fe-8b8d-11284843050d.webp");

describe("site branding image URLs", () => {
  for (const [field, errorPrefix] of [["logo", "SITE_LOGO_URL"], ["logoIcon", "SITE_FAVICON_URL"]] as const) {
    test(`${field} accepts the media picker proxy URL without adding an origin`, () => {
      expect(validateSiteSettingsInput({ ...baseInput, [field]: mediaUrl })[field]).toBe(mediaUrl);
    });

    test(`${field} accepts encoded media keys and root-relative image paths`, () => {
      for (const url of [proxyUrl("media/brand icon #1.png"), "/assets/brand.svg", `${mediaUrl}?v=2`]) {
        expect(validateSiteSettingsInput({ ...baseInput, [field]: `  ${url}  ` })[field]).toBe(url);
      }
    });

    test(`${field} preserves external HTTP and HTTPS URLs`, () => {
      for (const url of ["http://cdn.example/logo.png", "https://cdn.example/api/direct/image-id"]) {
        expect(validateSiteSettingsInput({ ...baseInput, [field]: `  ${url}  ` })[field]).toBe(url);
      }
    });

    test(`${field} allows clearing an image`, () => {
      for (const value of [undefined, null, "", "  "]) {
        expect(validateSiteSettingsInput({ ...baseInput, [field]: value })[field]).toBeNull();
      }
    });

    test(`${field} rejects unsafe protocols and ambiguous relative URLs`, () => {
      for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://cdn.example/logo.png", "//cdn.example/logo.png", "/\\cdn.example/logo.png", "/\n/cdn.example/logo.png", "media/logo.png", "not a URL"]) {
        expect(() => validateSiteSettingsInput({ ...baseInput, [field]: url })).toThrow(`${errorPrefix}_INVALID`);
      }
    });

    test(`${field} keeps the existing URL length limit`, () => {
      expect(() => validateSiteSettingsInput({ ...baseInput, [field]: `/${"a".repeat(2_048)}` })).toThrow(`${errorPrefix}_TOO_LONG`);
    });
  }

  test("the site URL still requires an absolute HTTP or HTTPS URL", () => {
    for (const siteUrl of [mediaUrl, "/", "//shop.example"]) {
      expect(() => validateSiteSettingsInput({ ...baseInput, siteUrl })).toThrow("SITE_URL_INVALID");
    }
    expect(validateSiteSettingsInput({ ...baseInput, siteUrl: "https://shop.example" }).siteUrl).toBe("https://shop.example/");
  });

  test("public settings preserve separate logo and favicon media paths and the fallback", () => {
    const faviconUrl = proxyUrl("media/favicon.png");
    const record = {
      ...validateSiteSettingsInput({ ...baseInput, logo: mediaUrl, logoIcon: faviconUrl }),
      id: 1,
      translationsJson: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    expect(toPublicSiteSettings(record)).toMatchObject({ logo: mediaUrl, logoIcon: faviconUrl });
    expect(toPublicSiteSettings({ ...record, logoIcon: null })).toMatchObject({ logo: mediaUrl, logoIcon: mediaUrl });
  });
});
