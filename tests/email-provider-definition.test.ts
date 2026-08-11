import { describe, expect, test } from "bun:test";

import { emailProviderFormValues, parseEmailProviderConfigForKind, recoverEmailProviderFormValues, serializeEmailProviderConfig } from "../server/push/provider-definitions";

describe("email provider configuration", () => {
  test("stores a complete QQ SMTP configuration in D1 JSON", () => {
    const config = JSON.parse(serializeEmailProviderConfig({
      id: 2,
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP post office",
      isEnabled: true,
      values: {
        from: "sender@example.com",
        host: "smtp.qq.com",
        port: 465,
        secure: true,
        username: "sender@example.com",
        password: "fake-smtp-credential",
        authType: "plain",
      },
    }, "{\"kind\":\"smtp\",\"port\":0}"));

    expect(config).toMatchObject({
      kind: "smtp",
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      username: "sender@example.com",
      password: "fake-smtp-credential",
      from: "sender@example.com",
      authType: "plain",
    });
  });

  test("preserves an existing SMTP credential when the field is missing", () => {
    const existing = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", password: "old-smtp-credential", authType: "plain" },
    });
    const updated = JSON.parse(serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", authType: "plain" },
    }, existing));

    expect(updated.password).toBe("old-smtp-credential");
  });

  test("stores credentials but only returns configured secret field names", () => {
    const stored = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "API",
      name: "API",
      isEnabled: true,
      values: { apiProvider: "BREVO", endpoint: "https://api.example.com/v3/email", apiKey: "fake-api-key", from: "sender@example.com", timeoutMs: 10000 },
    });

    expect(stored).toContain("fake-api-key");
    const form = emailProviderFormValues("API", stored);
    expect(form.configuredSecrets).toEqual(["apiKey"]);
    expect(form.values).not.toHaveProperty("apiKey");
    expect(JSON.stringify(form)).not.toContain("fake-api-key");
  });

  test("rejects invalid definition values and unknown stored fields", () => {
    expect(() => serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "API",
      name: "API",
      isEnabled: true,
      values: { apiProvider: "UNKNOWN", endpoint: "not-a-url", apiKey: "fake-api-key", from: "not-an-email", timeoutMs: 999 },
    })).toThrow();

    const stored = JSON.stringify({ schemaVersion: 1, kind: "smtp", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", password: "stored-secret", authType: "plain", from: "sender@example.com", unknown: true });
    expect(() => parseEmailProviderConfigForKind("SMTP", stored)).toThrow("EMAIL_PROVIDER_FIELD_INVALID");
    const recovered = recoverEmailProviderFormValues("SMTP", stored);
    expect(recovered.configuredSecrets).toEqual(["password"]);
    expect(recovered.values).not.toHaveProperty("unknown");
    expect(JSON.stringify(recovered)).not.toContain("stored-secret");
  });

  test("rejects clearing a required credential", () => {
    const existing = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", password: "old-smtp-credential", authType: "plain" },
    });

    expect(() => serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "SMTP",
      name: "SMTP",
      isEnabled: true,
      values: { from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, username: "sender@example.com", password: null, authType: "plain" },
    }, existing)).toThrow("Required JSON form field: password");
  });

  test("ignores arbitrary Cloudflare binding names", () => {
    const stored = serializeEmailProviderConfig({
      channel: "EMAIL",
      provider: "CLOUDFLARE",
      name: "Cloudflare",
      isEnabled: true,
      values: { from: "sender@example.com" },
    });

    expect(JSON.parse(stored)).toEqual({ schemaVersion: 1, kind: "cloudflare", from: "sender@example.com" });
    expect(emailProviderFormValues("CLOUDFLARE", stored)).toEqual({
      values: { from: "sender@example.com", fromName: "", replyTo: "" },
      configuredSecrets: [],
    });
  });
});
