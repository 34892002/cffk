export class PaymentCallbackPayloadError extends Error {}

export const MAX_PAYMENT_CALLBACK_BYTES = 64 * 1024;
const MAX_PAYMENT_CALLBACK_FIELDS = 64;
const MAX_PAYMENT_CALLBACK_FIELD_BYTES = 4 * 1024;

function failPayload(): never {
  throw new PaymentCallbackPayloadError("PAYMENT_CALLBACK_PAYLOAD_INVALID");
}

function assertLength(value: string, maximum: number) {
  if (new TextEncoder().encode(value).byteLength > maximum) failPayload();
}

function assertField(key: string, value: string) {
  if (!key || key.length > 128) failPayload();
  assertLength(value, MAX_PAYMENT_CALLBACK_FIELD_BYTES);
}

function formPayload(parameters: URLSearchParams) {
  const payload: Record<string, string> = {};
  for (const [key, value] of parameters) {
    assertField(key, value);
    if (Object.hasOwn(payload, key) || Object.keys(payload).length >= MAX_PAYMENT_CALLBACK_FIELDS) failPayload();
    payload[key] = value;
  }
  return payload;
}

export function normalizePaymentCallbackPayload(method: string, url: string, rawBody: string) {
  if (method === "GET") {
    if (url.length > MAX_PAYMENT_CALLBACK_BYTES) failPayload();
    return formPayload(new URL(url).searchParams);
  }
  assertLength(rawBody, MAX_PAYMENT_CALLBACK_BYTES);
  if (rawBody.trim().startsWith("{")) {
    let value: unknown;
    try { value = JSON.parse(rawBody); } catch { failPayload(); }
    if (!value || typeof value !== "object" || Array.isArray(value)) failPayload();
    const entries = Object.entries(value);
    if (entries.length > MAX_PAYMENT_CALLBACK_FIELDS) failPayload();
    const payload: Record<string, string> = {};
    for (const [key, item] of entries) {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean" && item !== null) failPayload();
      const normalized = item === null ? "" : String(item);
      assertField(key, normalized);
      payload[key] = normalized;
    }
    payload.__raw_body = rawBody;
    return payload;
  }
  return formPayload(new URLSearchParams(rawBody));
}
