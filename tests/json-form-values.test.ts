import { describe, expect, test } from "bun:test";

import {
  buildJsonFormSubmission,
  mergeJsonFormValues,
  normalizeJsonFormInputValue,
  redactJsonFormValues,
  validateJsonFormValues,
  type JsonFormFieldDefinition,
} from "../lib/json-form-values";

const fields: JsonFormFieldDefinition[] = [
  { key: "host", label: "Host", type: "text", required: true },
  { key: "port", label: "Port", type: "number", required: true, min: 1, max: 65535 },
  { key: "mode", label: "Mode", type: "select", required: true, options: [{ label: "Plain", value: "plain" }] },
  { key: "replyTo", label: "Reply to", type: "email" },
  { key: "endpoint", label: "Endpoint", type: "url" },
  { key: "password", label: "Password", type: "password", required: true, secret: true },
];

describe("JSON form values", () => {
  test("normalizes number inputs without turning empty input into zero", () => {
    expect(normalizeJsonFormInputValue("number", 465)).toBe(465);
    expect(normalizeJsonFormInputValue("number", "465")).toBe(465);
    expect(normalizeJsonFormInputValue("number", "")).toBe("");
    expect(normalizeJsonFormInputValue("number", Number.NaN)).toBe("");
  });

  test("validates required values, types, ranges, options, email, and URL fields", () => {
    const valid = { host: "smtp.example.com", port: 465, mode: "plain", replyTo: "reply@example.com", endpoint: "https://api.example.com", password: "fake-secret" };
    expect(validateJsonFormValues(fields, valid)).toBe(valid);
    expect(() => validateJsonFormValues(fields, { ...valid, port: 0 })).toThrow("Invalid JSON form field: port");
    expect(() => validateJsonFormValues(fields, { ...valid, mode: "unknown" })).toThrow("Invalid JSON form field: mode");
    expect(() => validateJsonFormValues(fields, { ...valid, replyTo: "invalid" })).toThrow("Invalid JSON form field: replyTo");
    expect(() => validateJsonFormValues(fields, { ...valid, endpoint: "ftp://api.example.com" })).toThrow("Invalid JSON form field: endpoint");
    expect(() => validateJsonFormValues(fields, { ...valid, host: "" })).toThrow("Required JSON form field: host");
  });

  test("redacts secret values and returns configured field names", () => {
    const result = redactJsonFormValues(fields, { host: "smtp.example.com", port: 465, mode: "plain", password: "fake-secret" });
    expect(result).toEqual({
      values: { host: "smtp.example.com", port: 465, mode: "plain" },
      configuredSecrets: ["password"],
    });
    expect(JSON.stringify(result)).not.toContain("fake-secret");
  });

  test("uses missing, string, and null for preserve, replace, and clear", () => {
    const existing = { password: "old-secret" };
    expect(mergeJsonFormValues(fields, { host: "smtp.example.com", port: 465 }, existing).password).toBe("old-secret");
    expect(mergeJsonFormValues(fields, { host: "smtp.example.com", port: 465, password: "new-secret" }, existing).password).toBe("new-secret");
    expect(mergeJsonFormValues(fields, { host: "smtp.example.com", port: 465, password: null }, existing)).not.toHaveProperty("password");
  });

  test("builds one values payload without a secret operation object", () => {
    expect(buildJsonFormSubmission(fields, { host: "smtp.example.com", port: 465, password: "" })).toEqual({ host: "smtp.example.com", port: 465 });
    expect(buildJsonFormSubmission(fields, { host: "smtp.example.com", port: 465, password: "new-secret" })).toEqual({ host: "smtp.example.com", port: 465, password: "new-secret" });
    expect(buildJsonFormSubmission(fields, { host: "smtp.example.com", port: 465 }, ["password"])).toEqual({ host: "smtp.example.com", port: 465, password: null });
  });

  test("rejects unknown fields and invalid secret values", () => {
    expect(() => mergeJsonFormValues(fields, { unknown: "value" }, {})).toThrow("Unknown JSON form field");
    expect(() => mergeJsonFormValues(fields, { password: 123 }, {})).toThrow("Invalid secret field");
  });
});
