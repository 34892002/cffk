import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeAlipayParameters, parseAmountToCents } from "../lib/payment-utils.ts";
import { emailRetryDelayMs, renderEmailTemplate } from "../lib/email-utils.ts";
import { canConfirmPayment, paymentConfirmationOutcome } from "../lib/order-state.ts";
import { sanitizeDatabaseLogJson, sanitizeDatabaseLogText } from "../server/database-log-sanitizer.ts";

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

test("renderEmailTemplate replaces known variables and blanks missing variables", () => {
  assert.equal(renderEmailTemplate("Hi {{ name }} / {{missing}} / {{amount}}", { name: "Ada", amount: 12 }), "Hi Ada /  / 12");
});

test("email retry delay backs off and caps at one hour", () => {
  assert.equal(emailRetryDelayMs(1), 60_000);
  assert.equal(emailRetryDelayMs(2), 120_000);
  assert.equal(emailRetryDelayMs(7), 3_600_000);
  assert.equal(emailRetryDelayMs(10), 3_600_000);
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
