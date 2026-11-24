import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { test } from "bun:test";
import { buildJsonFormSubmission, getJsonFormErrors, mergeJsonFormValues, type JsonFormFieldDefinition } from "../../lib/json-form-values";

const fields: JsonFormFieldDefinition[] = [
  { key: "mode", label: "Mode", type: "select", required: true, options: [{ label: "MD5", value: "MD5" }, { label: "RSA", value: "RSA" }] },
  { key: "secret", label: "Secret", type: "password", required: true, secret: true, visibleWhen: { key: "mode", in: ["MD5"] } },
  { key: "privateKey", label: "Private key", type: "textarea", required: true, secret: true, visibleWhen: { key: "mode", in: ["RSA"] } },
];

test("conditional fields are only validated while visible", () => {
  assert.deepEqual(getJsonFormErrors(fields, { mode: "MD5", secret: "s" }), {});
  assert.deepEqual(getJsonFormErrors(fields, { mode: "RSA", privateKey: "p" }), {});
  assert.deepEqual(getJsonFormErrors(fields, { mode: "MD5" }), { secret: "请填写Secret。" });
  assert.deepEqual(getJsonFormErrors(fields, { mode: "RSA" }), { privateKey: "请填写Private key。" });
});

test("submissions drop values of fields hidden by the current selection", () => {
  const values = { mode: "MD5" as const, secret: "old-secret", privateKey: "stale-private-key" };
  assert.deepEqual(buildJsonFormSubmission(fields, values), { mode: "MD5", secret: "old-secret" });
  assert.deepEqual(buildJsonFormSubmission(fields, { ...values, mode: "RSA" }), { mode: "RSA", privateKey: "stale-private-key" });
  assert.deepEqual(buildJsonFormSubmission(fields, values, ["secret"]), { mode: "MD5", secret: null });
});

test("merged configuration drops secrets that the selected mode no longer uses", () => {
  const existing = { mode: "RSA", privateKey: "old-private-key" };
  assert.deepEqual(mergeJsonFormValues(fields, { mode: "MD5", secret: "new-secret" }, existing), { mode: "MD5", secret: "new-secret" });
  assert.deepEqual(mergeJsonFormValues(fields, { mode: "RSA", privateKey: "new-private-key" }, { mode: "MD5", secret: "old-secret" }), { mode: "RSA", privateKey: "new-private-key" });
});

test("legacy payloads without the controlling field keep stored secrets untouched", () => {
  assert.deepEqual(mergeJsonFormValues(fields, { secret: "kept" }, { secret: "stored", privateKey: "stale" }), { secret: "kept", privateKey: "stale" });
});
