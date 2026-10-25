import { describe, it, expect } from "vitest";
import { applyCredit, creditBalance, creditForPayment, creditLabel, paymentLockKey, refundBlockedByCredit } from "@/lib/credit";

describe("what a missed or cancelled booking turns into", () => {
  it("Rs 10 booking fee only: the Rs 10", () => {
    expect(creditForPayment({ status: "PAID", amountMinor: 1000, refundedMinor: 0 })).toBe(1000);
  });
  it("full fee paid online: everything paid (doctor fee and the Rs 10)", () => {
    expect(creditForPayment({ status: "PAID", amountMinor: 51000, refundedMinor: 0 })).toBe(51000);
  });
  it("nothing when the payment never settled or was already refunded", () => {
    for (const status of ["CREATED", "FAILED", "EXPIRED", "REFUNDED"]) {
      expect(creditForPayment({ status, amountMinor: 1000, refundedMinor: 0 })).toBe(0);
    }
    expect(creditForPayment({ status: "PAID", amountMinor: 51000, refundedMinor: 51000 })).toBe(0);
  });
  it("a part-refunded payment credits only what is left", () => {
    expect(creditForPayment({ status: "PAID", amountMinor: 51000, refundedMinor: 50000 })).toBe(1000);
  });
});

describe("wallet balance", () => {
  it("is the sum of the ledger: credits positive, use and refunds negative; never expires", () => {
    expect(creditBalance([])).toBe(0);
    expect(creditBalance([{ amountMinor: 1000 }, { amountMinor: 51000 }, { amountMinor: -50000 }])).toBe(2000);
  });
});

describe("using credit on a new booking", () => {
  it("covers the whole charge when the balance is enough", () => {
    expect(applyCredit(1000, 1000)).toEqual({ usedMinor: 1000, payMinor: 0 });
    expect(applyCredit(1000, 51000)).toEqual({ usedMinor: 1000, payMinor: 0 });
  });
  it("covers part of the charge and leaves the rest to pay", () => {
    expect(applyCredit(51000, 1000)).toEqual({ usedMinor: 1000, payMinor: 50000 });
  });
  it("uses nothing with an empty or negative balance", () => {
    expect(applyCredit(1000, 0)).toEqual({ usedMinor: 0, payMinor: 1000 });
    expect(applyCredit(1000, -5)).toEqual({ usedMinor: 0, payMinor: 1000 });
  });
  it("labels amounts for emails", () => {
    expect(creditLabel(1000, "INR")).toMatch(/10/);
  });
});

describe("a payment is credited or refunded, never both", () => {
  it("is not refundable once it became wallet credit", () => {
    expect(refundBlockedByCredit([{ kind: "MISSED", amountMinor: 1000 }])).toBe(true);
    expect(refundBlockedByCredit([{ kind: "CANCELLED", amountMinor: 51000 }])).toBe(true);
  });
  it("is refundable when no credit was issued from it", () => {
    expect(refundBlockedByCredit([])).toBe(false);
    expect(refundBlockedByCredit([{ kind: "USED", amountMinor: -1000 }])).toBe(false);
  });
  it("is refundable again once the credit has been removed", () => {
    expect(refundBlockedByCredit([{ kind: "MISSED", amountMinor: 1000 }, { kind: "REFUND_REMOVED", amountMinor: -1000 }])).toBe(false);
  });
  it("credit and refund of one payment share a lock key", () => {
    expect(paymentLockKey("pay_1")).toBe("pay:pay_1");
  });
});
