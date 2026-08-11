import { describe, expect, test } from "bun:test";
import { normalizeJsonFormInputValue } from "../lib/json-form-values";
import { serializeEmailProviderConfig } from "../server/push/provider-definitions";

describe("email provider configuration", () => {
  test("normalizes dynamic number fields without turning empty input into zero", () => {
    expect(normalizeJsonFormInputValue("number", 465)).toBe(465);
    expect(normalizeJsonFormInputValue("number", "465")).toBe(465);
    expect(normalizeJsonFormInputValue("number", "")).toBe("");
    expect(normalizeJsonFormInputValue("number", Number.NaN)).toBe("");
  });

  test("replaces an invalid stored SMTP configuration with a complete submission", () => {
    const config = JSON.parse(serializeEmailProviderConfig({
      id: 2,
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP 邮局",
      isEnabled: true,
      values: {
        from: "wx_ggyy@qq.com",
        host: "smtp.qq.com",
        port: 465,
        username: "wx_ggyy@qq.com",
        authType: "plain",
      },
      secrets: { password: { value: "SMTP_PASSWORD" } },
    }, "{\"kind\":\"smtp\",\"port\":0}"));

    expect(config).toMatchObject({
      kind: "smtp",
      host: "smtp.qq.com",
      port: 465,
      secure: false,
      username: "wx_ggyy@qq.com",
      password: { secret: "SMTP_PASSWORD" },
      from: "wx_ggyy@qq.com",
      authType: "plain",
    });
  });
});
