import assert from "node:assert/strict";

// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { test } from "bun:test";
import { reconcilePaymentCandidates } from "../../server/payment/reconciliation-service.ts";
import type { PaymentQueryResult } from "../../server/payment/types.ts";

const candidate = { orderId: 1, orderNo: "ORD-1", amount: 1234, attemptId: 10, paymentOrderNo: "ORD-1" };

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

test("scheduled Alipay query errors do not confirm payment", async () => {
  const failure = new Error("network unavailable");
  const deps = dependencies(failure);
  const summary = await reconcilePaymentCandidates([candidate], deps.value);
  assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 0, failed: 1, closeableOrderIds: [] });
  assert.deepEqual(deps.confirmations, []);
  assert.deepEqual(deps.reports, [failure]);
});

test("scheduled Alipay query rejects order and amount mismatches", async () => {
  for (const result of [queryResult({ orderNo: "ORD-other" }), queryResult({ amount: 999 })]) {
    const deps = dependencies(result);
    const summary = await reconcilePaymentCandidates([candidate], deps.value);
    assert.deepEqual(summary, { scanned: 1, confirmed: 0, pending: 0, failed: 1, closeableOrderIds: [] });
    assert.deepEqual(deps.confirmations, []);
  }
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
  assert.deepEqual(summary, { scanned: 2, confirmed: 1, pending: 0, failed: 1, closeableOrderIds: [] });
  assert.deepEqual(confirmations, ["ORD-2"]);
});
