import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/app-error.ts";
import { reportUnexpectedRequestError, reportUnexpectedServerError, withServerDataErrorHandling } from "../server/error-handling.ts";

test("unexpected request errors retain raw request and stack for Observability", async () => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => entries.push(args);

  try {
    const cause = new Error("provider rejected token=raw-token");
    await reportUnexpectedRequestError(
      "test.request",
      cause,
      new Request("https://shop.example.test/api/payment?order=ORD-1", {
        method: "POST",
        headers: { "x-provider-token": "raw-token" },
        body: "sign=raw-sign&amount=12.00",
      }),
      { providerResponse: { secret: "raw-secret" } },
    );
  } finally {
    console.error = original;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.[0], "Unhandled server error");
  const payload = entries[0]?.[1] as { error: { message: string; stack?: string }; details: { request: { body: string; headers: Record<string, string> }; providerResponse: { secret: string } } };
  assert.match(payload.error.message, /raw-token/);
  assert.ok(payload.error.stack);
  assert.equal(payload.details.request.body, "sign=raw-sign&amount=12.00");
  assert.equal(payload.details.request.headers["x-provider-token"], "raw-token");
  assert.equal(payload.details.providerResponse.secret, "raw-secret");
});

test("page data errors retain the route context and stack for Observability", async () => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => entries.push(args);

  try {
    await assert.rejects(
      withServerDataErrorHandling(
        "page data: product",
        { urlPathname: "/product/ce-shi", routeParams: { slug: "ce-shi" } },
        async () => {
          throw new Error("D1_ERROR: no such column: product.manualDeliveryHint");
        },
      ),
    );
  } finally {
    console.error = original;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.[0], "Unhandled server error");
  const payload = entries[0]?.[1] as { scope: string; error: { message: string; stack?: string }; details: { page: { urlPathname?: string; routeParams?: { slug: string } } } };
  assert.equal(payload.scope, "page data: product");
  assert.match(payload.error.message, /manualDeliveryHint/);
  assert.ok(payload.error.stack);
  assert.equal(payload.details.page.urlPathname, "/product/ce-shi");
  assert.deepEqual(payload.details.page.routeParams, { slug: "ce-shi" });
});

test("expected business errors are not reported as unexpected errors", () => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => entries.push(args);
  try {
    reportUnexpectedServerError("test.business", new AppError("ORDER_NOT_FOUND"));
  } finally {
    console.error = original;
  }
  assert.equal(entries.length, 0);
});
