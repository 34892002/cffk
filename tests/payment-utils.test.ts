import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeAlipayParameters, parseAmountToCents } from "../lib/payment-utils.ts";
import { pushRetryDelayMs, renderPushTemplate } from "../lib/push-utils.ts";
import { canConfirmPayment, paymentConfirmationOutcome } from "../lib/order-state.ts";
import { sanitizeDatabaseLogJson, sanitizeDatabaseLogText } from "../server/database-log-sanitizer.ts";
import { sanitizePaymentLogPayload } from "../server/payment/log-service.ts";
import { cloudflareEmailError, deliveryItemsFromSnapshots, orderQueryUrl } from "../server/push/service.ts";
import { getEmailTemplateDefinition } from "../server/email/template-definitions.ts";
import { SITE_TIMEZONES, dateBoundaryInTimezone, dateTimeInTimezone, formatDateInTimezone, formatDateTimeInputInTimezone, normalizeSiteTimezone, startOfDayInTimezone } from "../lib/site-timezone.ts";

test("site timezones accept only standard IANA values", () => {
  assert.ok(SITE_TIMEZONES.length >= 400);
  assert.equal(SITE_TIMEZONES.filter((timezone) => timezone === "UTC").length, 1);
  assert.equal(SITE_TIMEZONES.some((timezone) => timezone.startsWith("Etc/")), false);
  assert.equal(normalizeSiteTimezone("Asia/Shanghai"), "Asia/Shanghai");
  assert.equal(normalizeSiteTimezone("Asia/Kathmandu"), "Asia/Kathmandu");
  assert.equal(normalizeSiteTimezone("UTC"), "UTC");
  for (const value of ["UTC+05:30", "Etc/GMT+12", "Not/A_Zone"]) assert.throws(() => normalizeSiteTimezone(value));
});

test("site timezone boundaries preserve non-whole-hour IANA zones and DST", () => {
  assert.equal(dateBoundaryInTimezone("2026-01-02", "Asia/Kathmandu").toISOString(), "2026-01-01T18:15:00.000Z");
  assert.equal(dateTimeInTimezone("2026-01-02T00:15", "America/St_Johns").toISOString(), "2026-01-02T03:45:00.000Z");
  assert.equal(startOfDayInTimezone(new Date("2026-07-01T12:00:00.000Z"), "America/New_York").toISOString(), "2026-07-01T04:00:00.000Z");
  assert.equal(startOfDayInTimezone(new Date("2026-01-01T12:00:00.000Z"), "America/New_York").toISOString(), "2026-01-01T05:00:00.000Z");
  assert.equal(formatDateTimeInputInTimezone("2026-01-01T18:15:00.000Z", "Asia/Kathmandu"), "2026-01-02T00:00");
  assert.match(formatDateInTimezone("2026-01-01T18:15:00.000Z", "Asia/Kathmandu", { dateStyle: "short", timeStyle: "short" }), /2026/);
});

test("Cloudflare Email Sending errors map to retryable and fixed internal codes", () => {
  assert.equal(cloudflareEmailError({ code: "E_RATE_LIMIT_EXCEEDED", message: "rate limited" }), "EMAIL_CLOUDFLARE_RATE_LIMITED");
  assert.equal(cloudflareEmailError(new Error("E_DELIVERY_FAILED")), "EMAIL_CLOUDFLARE_FAILED");
  assert.equal(cloudflareEmailError({ code: "E_SENDER_NOT_VERIFIED", message: "private provider detail" }), "EMAIL_CLOUDFLARE_SENDER_NOT_VERIFIED");
  assert.equal(cloudflareEmailError(new Error("unrecognized provider detail")), "EMAIL_CLOUDFLARE_FAILED");
});

test("parseAmountToCents accepts exact yuan values with up to two decimals", () => {
  assert.equal(parseAmountToCents("0"), 0);
  assert.equal(parseAmountToCents("1"), 100);
  assert.equal(parseAmountToCents("1.2"), 120);
  assert.equal(parseAmountToCents("1.23"), 123);
  assert.equal(parseAmountToCents("100000000000"), 10000000000000);
});

test("parseAmountToCents rejects malformed and unsafe values", () => {
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents(".99"), null);
  assert.equal(parseAmountToCents("1.234"), null);
  assert.equal(parseAmountToCents("1e2"), null);
  assert.equal(parseAmountToCents("-1"), null);
  assert.equal(parseAmountToCents("999999999999999999999999"), null);
});

test("renderPushTemplate replaces known variables and blanks missing variables", () => {
  assert.equal(renderPushTemplate("Hi {{ name }} / {{missing}} / {{amount}}", { name: "Ada", amount: 12 }), "Hi Ada /  / 12");
});

test("order email variables preserve delivery content and create a direct query URL", () => {
  assert.equal(deliveryItemsFromSnapshots([]), "暂无发货内容");
  assert.equal(deliveryItemsFromSnapshots(['["CARD-1","CARD-2"]']), "1. CARD-1\n2. CARD-2");
  assert.equal(deliveryItemsFromSnapshots(["manual delivery"]), "manual delivery");
  assert.equal(
    orderQueryUrl("https://shop.example.com/", "ORD 1/2", "token+value="),
    "https://shop.example.com/order?orderNo=ORD+1%2F2&token=token%2Bvalue%3D",
  );
  assert.ok(getEmailTemplateDefinition("DELIVERY_SUCCESS").variables.some((variable) => variable.key === "deliveryItems"));
});

test("push retry delay backs off and caps at one hour", () => {
  assert.equal(pushRetryDelayMs(1), 60_000);
  assert.equal(pushRetryDelayMs(2), 120_000);
  assert.equal(pushRetryDelayMs(7), 3_600_000);
  assert.equal(pushRetryDelayMs(10), 3_600_000);
});

test("payment confirmation accepts only a pending unpaid order", () => {
  assert.equal(canConfirmPayment("PENDING", "UNPAID"), true);
  assert.equal(canConfirmPayment("CLOSED", "UNPAID"), false);
  assert.equal(canConfirmPayment("FAILED", "UNPAID"), false);
  assert.equal(canConfirmPayment("PAID", "PAID"), false);
  assert.equal(canConfirmPayment("DELIVERED", "PAID"), false);
  assert.equal(paymentConfirmationOutcome("PENDING", "UNPAID"), "CONFIRMED");
  assert.equal(paymentConfirmationOutcome("PAID", "PAID"), "ALREADY_PAID");
  assert.equal(paymentConfirmationOutcome("CLOSED", "UNPAID"), "NOT_PAYABLE");
  assert.equal(paymentConfirmationOutcome("FAILED", "FAILED"), "NOT_PAYABLE");
});

test("database log sanitizer removes signatures and credentials but preserves business fields", () => {
  const payload = JSON.parse(sanitizeDatabaseLogJson({
    out_trade_no: "ORD-1",
    amount: "12.00",
    sign: "signature-value",
    nested: { accessKey: "access-key", status: "TRADE_SUCCESS" },
    items: [{ token: "token-value", trade_no: "TRADE-1" }],
  }));
  assert.deepEqual(payload, {
    out_trade_no: "ORD-1",
    amount: "12.00",
    nested: { status: "TRADE_SUCCESS" },
    items: [{ trade_no: "TRADE-1" }],
  });
  assert.equal(sanitizeDatabaseLogText("provider failed: token=secret-value; status=500"), "provider failed: token=[REDACTED]; status=500");
});

test("payment logs redact credentials and raw callback bodies", () => {
  const payload = sanitizePaymentLogPayload({
    orderNo: "ORD-1",
    sign: "signature-value",
    privateKey: "private-key",
    nested: { authorization: "bearer token", status: "PAID" },
    __raw_body: "secret callback body",
  });
  assert.deepEqual(payload, {
    orderNo: "ORD-1",
    sign: "[redacted]",
    privateKey: "[redacted]",
    nested: { authorization: "[redacted]", status: "PAID" },
    __raw_body: "[redacted]",
  });
});

test("canonicalizeAlipayParameters sorts fields and excludes signature fields", () => {
  assert.equal(
    canonicalizeAlipayParameters({ sign: "ignored", b: "2", a: "1", empty: "" }),
    "a=1&b=2",
  );
  assert.equal(
    canonicalizeAlipayParameters({ sign: "ignored", sign_type: "RSA2", b: "2", a: "1" }, true),
    "a=1&b=2",
  );
  assert.equal(
    canonicalizeAlipayParameters({ sign: "ignored", sign_type: "RSA2", b: "2", a: "1" }),
    "a=1&b=2&sign_type=RSA2",
  );
});
