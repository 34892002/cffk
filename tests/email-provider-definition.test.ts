import { describe, expect, test } from "bun:test";

import { normalizeJsonFormInputValue } from "../lib/json-form-values";
import { maskedEmailProviderConfig, serializeEmailProviderConfig } from "../server/push/provider-definitions";

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
        secure: true,
        username: "wx_ggyy@qq.com",
        authType: "plain",
      },
      secrets: { password: { value: "smtp-authorization-code" } },
    }, "{\"kind\":\"smtp\",\"port\":0}"));

    expect(config).toMatchObject({
      kind: "smtp",
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      username: "wx_ggyy@qq.com",
      password: "smtp-authorization-code",
      from: "wx_ggyy@qq.com",
      authType: "plain",
    });
  });

  test("keeps an existing SMTP credential without returning it to the form", () => {
    const existing = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", authType: "plain" },
      secrets: { password: { value: "smtp-authorization-code" } },
    });
    const updated = JSON.parse(serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", authType: "plain" },
      secrets: { password: { keepExisting: true } },
    }, existing));

    expect(updated.password).toBe("smtp-authorization-code");
  });

  test("returns only masked SMTP credential state to the form", () => {
    const stored = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", authType: "plain" },
      secrets: { password: { value: "fake-smtp-credential" } },
    });

    expect(stored).toContain("fake-smtp-credential");
    const masked = maskedEmailProviderConfig("SMTP", stored);
    expect(masked.secrets.password).toEqual({ configured: true, masked: "********" });
    expect(JSON.stringify(masked)).not.toContain("fake-smtp-credential");
  });

  test("stores API keys in D1 JSON but returns only masked state", () => {
    const stored = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "API",
      name: "Brevo",
      isEnabled: true,
      values: {
        apiProvider: "BREVO",
        endpoint: "https://api.example.com/v3/email",
        from: "sender@example.com",
        timeoutMs: 10000,
      },
      secrets: { apiKey: { value: "fake-api-key" } },
    });

    expect(stored).toContain("fake-api-key");
    const masked = maskedEmailProviderConfig("API", stored);
    expect(masked.secrets.apiKey).toEqual({ configured: true, masked: "********" });
    expect(JSON.stringify(masked)).not.toContain("fake-api-key");
  });

  test("uses the fixed EMAIL binding for Cloudflare provider configuration", () => {
    const stored = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "CLOUDFLARE",
      name: "Cloudflare",
      isEnabled: true,
      values: { from: "sender@example.com", binding: "UNDECLARED_BINDING" },
    });

    expect(JSON.parse(stored)).toEqual({ schemaVersion: 1, kind: "cloudflare", from: "sender@example.com" });
    expect(maskedEmailProviderConfig("CLOUDFLARE", stored)).toEqual({
      values: { from: "sender@example.com", fromName: "", replyTo: "" },
      secrets: {},
    });
  });
});
