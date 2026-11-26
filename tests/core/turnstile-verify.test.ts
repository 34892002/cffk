import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, test } from "bun:test";
import { AppError } from "../../lib/app-error";
import { verifyTurnstileToken } from "../../server/security/turnstile";

const originalFetch = globalThis.fetch;
const configured = { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (cause) {
    return cause instanceof AppError ? cause.code : String(cause);
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("verifyTurnstileToken", () => {
  test("skips verification when Turnstile is not fully configured", async () => {
    globalThis.fetch = (async () => { throw new Error("should not fetch"); }) as typeof fetch;
    await verifyTurnstileToken({}, undefined);
    await verifyTurnstileToken({ TURNSTILE_SITE_KEY: "site" }, undefined);
    await verifyTurnstileToken({ TURNSTILE_SECRET_KEY: "secret" }, undefined);
  });

  test("requires a token when Turnstile is enabled", async () => {
    globalThis.fetch = (async () => { throw new Error("should not fetch"); }) as typeof fetch;
    assert.equal(await errorCode(verifyTurnstileToken(configured, undefined)), "TURNSTILE_REQUIRED");
    assert.equal(await errorCode(verifyTurnstileToken(configured, "  ")), "TURNSTILE_REQUIRED");
  });

  test("accepts a verified token and posts it with the remote IP", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return jsonResponse({ success: true });
    }) as typeof fetch;

    await verifyTurnstileToken(configured, "token-value", "203.0.113.9");

    assert.equal(request?.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(request?.method, "POST");
    const body = new URLSearchParams(await request!.text());
    assert.equal(body.get("secret"), "secret");
    assert.equal(body.get("response"), "token-value");
    assert.equal(body.get("remoteip"), "203.0.113.9");
  });

  test("rejects failed verification and network errors", async () => {
    globalThis.fetch = (async () => jsonResponse({ success: false })) as typeof fetch;
    assert.equal(await errorCode(verifyTurnstileToken(configured, "token")), "TURNSTILE_FAILED");

    globalThis.fetch = (async () => { throw new Error("network"); }) as typeof fetch;
    assert.equal(await errorCode(verifyTurnstileToken(configured, "token")), "TURNSTILE_FAILED");
  });
});