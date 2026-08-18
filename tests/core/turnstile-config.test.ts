// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import { getTurnstileConfig } from "../../lib/turnstile-config";

describe("Turnstile configuration", () => {
  test("enables Turnstile only when both keys are configured", () => {
    expect(getTurnstileConfig({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" })).toEqual({
      enabled: true,
      siteKey: "site",
      secretKey: "secret",
    });
  });

  test("does not enable Turnstile when only one key remains", () => {
    expect(getTurnstileConfig({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: undefined }).enabled).toBe(false);
    expect(getTurnstileConfig({ TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: "secret" }).enabled).toBe(false);
    expect(getTurnstileConfig({ TURNSTILE_SITE_KEY: "  ", TURNSTILE_SECRET_KEY: "secret" }).enabled).toBe(false);
  });
});
