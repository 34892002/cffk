// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { detectBrowserLocale, resolveRequestLocale } from "../../lib/i18n/locale.ts";

describe("browser locale detection", () => {
  test("uses the first supported browser preference", () => {
    expect(detectBrowserLocale(["fr-FR", "en-GB", "zh-CN"])).toBe("en-US");
    expect(detectBrowserLocale(["zh-HK", "en-US"])).toBe("zh-TW");
  });

  test("maps simplified and traditional Chinese variants", () => {
    expect(detectBrowserLocale(["zh-CN"])).toBe("zh-CN");
    expect(detectBrowserLocale(["zh-Hant"])).toBe("zh-TW");
    expect(detectBrowserLocale(["zh-MO"])).toBe("zh-TW");
  });

  test("falls back to simplified Chinese for unsupported languages", () => {
    expect(detectBrowserLocale(["fr-FR", "ja-JP"])).toBe("zh-CN");
    expect(detectBrowserLocale([])).toBe("zh-CN");
  });
});

describe("request locale resolution", () => {
  test("prefers the locale cookie over Accept-Language", () => {
    expect(resolveRequestLocale({ cookie: "a=1; storefront-locale=en-US", acceptLanguage: "zh-CN,zh;q=0.9" })).toBe("en-US");
  });

  test("uses Accept-Language when the cookie is missing or invalid", () => {
    expect(resolveRequestLocale({ cookie: "storefront-locale=xx-YY", acceptLanguage: "en-GB,en;q=0.9" })).toBe("en-US");
    expect(resolveRequestLocale({ acceptLanguage: "zh-Hant-TW,zh;q=0.9" })).toBe("zh-TW");
  });

  test("falls back to simplified Chinese", () => {
    expect(resolveRequestLocale({})).toBe("zh-CN");
    expect(resolveRequestLocale({ acceptLanguage: "fr-FR,fr;q=0.9" })).toBe("zh-CN");
  });
});
