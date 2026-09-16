import assert from "node:assert/strict";

// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { test } from "bun:test";
import { reconcilePaymentCandidates } from "../../server/payment/reconciliation-service.ts";
import type { PaymentQueryResult } from "../../server/payment/types.ts";

const candidate = { orderId: 1, orderNo: "ORD-1", amount: 1234, attemptId: 10, paymentOrderNo: "ORD-1" };
const candidateWithoutAttempt = { ...candidate, orderId: 2, orderNo: "ORD-2", attemptId: null, paymentOrderNo: null };

function queryResult(overrides: Partial<PaymentQueryResult> = {}): PaymentQueryResult {
  return { provider: "ALIPAY", verified: true, orderNo: "ORD-1", paymentOrderNo: "TRADE-1", amount: 1234, status: "PAID", message: "ALIPAY_QUERY", ...overrides };
}

function dependencies(result: PaymentQueryResult | Error) {
  const confirmations: string[] = [];
  const logs: Array<{ status: string; message: string }> = [];
  const reports: unknown[] = [];
  return {
    confirmations,
    logs,
    reports,
    value: {
      query: async () => {
        if (result instanceof Error) throw result;
        return result;
      },
      confirm: async () => { confirmations.push(candidate.orderNo); },
      log: async (_candidate: typeof candidate, _result: PaymentQueryResult, status: "PENDING" | "VERIFIED" | "FAILED", message: string) => { logs.push({ status, message }); },
      report: (_candidate: typeof candidate, cause: unknown) => { reports.push(cause); },
    },
  };
}


test("scheduled Alipay query confirms a paid order before closure", async () => {
  const deps = dependencies(queryResult());
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 1, pending: 0, failed: 0, closeableOrderIds: [] });
  assert.deepEqual(deps.confirmations, ["ORD-1"]);
  assert.deepEqual(deps.logs, [{ status: "VERIFIED", message: "PAYMENT_QUERY_CONFIRMED" }]);
});

test("scheduled Alipay query leaves a provider-pending order unpaid", async () => {
  const deps = dependencies(queryResult({ status: "PENDING" }));
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 1, failed: 0, closeableOrderIds: [1] });
  assert.deepEqual(deps.confirmations, []);
});

test("scheduled Alipay query treats a missing provider trade as closeable pending", async () => {
  const deps = dependencies(queryResult({
    verified: true,
    status: "PENDING",
    amount: undefined,
    message: "ALIPAY_TRADE_NOT_EXIST",
  }));
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 1, failed: 0, closeableOrderIds: [1] });
  assert.deepEqual(deps.confirmations, []);
  assert.deepEqual(deps.logs, [{ status: "PENDING", message: "PAYMENT_QUERY_PENDING" }]);
});

test("scheduled Alipay query closes an order without a payment attempt without querying the provider", async () => {
  let queried = false;
  const deps = dependencies(queryResult({ orderNo: "ORD-2", status: "PENDING" }));
  deps.value.query = async () => {
    queried = true;
    return queryResult({ orderNo: "ORD-2", status: "PENDING" });
  };
  const summary = await reconcilePaymentCandidates([candidateWithoutAttempt], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 1, failed: 0, closeableOrderIds: [2] });
  assert.equal(queried, false);
  assert.deepEqual(deps.confirmations, []);
  assert.deepEqual(deps.logs, []);
});

test("scheduled Alipay query errors become closeable after the payment timeout", async () => {
  const failure = new Error("network unavailable");
  const deps = dependencies(failure);
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 0, failed: 1, closeableOrderIds: [1] });
  assert.deepEqual(deps.confirmations, []);
  assert.deepEqual(deps.reports, [failure]);
});

test("scheduled Alipay verification failures become closeable after the payment timeout", async () => {
  const deps = dependencies(queryResult({ verified: false }));
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 0, failed: 1, closeableOrderIds: [1] });
  assert.deepEqual(deps.confirmations, []);
  assert.deepEqual(deps.logs, [{ status: "FAILED", message: "PAYMENT_QUERY_VERIFY_FAILED" }]);
});

test("scheduled Alipay amount mismatches become closeable after the payment timeout", async () => {
  const deps = dependencies(queryResult({ amount: 999 }));
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 0, failed: 1, closeableOrderIds: [1] });
  assert.deepEqual(deps.confirmations, []);
  assert.deepEqual(deps.logs, [{ status: "FAILED", message: "PAYMENT_QUERY_AMOUNT_MISMATCH" }]);
});

test("scheduled reconciliation handles candidates independently", async () => {
  let call = 0;
  const confirmations: string[] = [];
  const summary = await reconcilePaymentCandidates([candidate, { ...candidate, orderId: 2, orderNo: "ORD-2", attemptId: 20 }], {
    query: async ({ orderNo }) => {
      call += 1;
      if (call === 1) throw new Error("temporary failure");
      return queryResult({ orderNo });
    },
    confirm: async (item) => { confirmations.push(item.orderNo); },
    log: async () => undefined,
    report: () => undefined,
  });
  assert.deepEqual(summary, { scanned: 2, confirmed: 1, pending: 0, failed: 1, closeableOrderIds: [1] });
  assert.deepEqual(confirmations, ["ORD-2"]);
});
