// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { detectBrowserLocale } from "../../lib/storefront-preferences.ts";

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
