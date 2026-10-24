import { describe, it, expect } from "vitest";
import {
  HOLD_MINUTES, beforeCancellationCutoff, holdExpiry, occupiesSlot, occupyingWhere, onPaid, settleCancellation,
} from "@/lib/holds";
import { hasBookingConflict } from "@/lib/booking";
import { assignToken } from "@/lib/tokens";
import { computeCharge } from "@/lib/fees";

const now = new Date("2026-10-26T10:00:00Z");
const mins = (m: number) => new Date(now.getTime() + m * 60_000);
const live = { status: "pending_payment", holdExpiresAt: mins(5) };
const lapsed = { status: "pending_payment", holdExpiresAt: mins(-1) };

describe("hold expiry and release", () => {
  it("a hold lasts HOLD_MINUTES", () => {
    expect(holdExpiry(now).getTime() - now.getTime()).toBe(HOLD_MINUTES * 60_000);
  });
  it("a live hold occupies the slot, a lapsed one does not", () => {
    expect(occupiesSlot(live, now)).toBe(true);
    expect(occupiesSlot(lapsed, now)).toBe(false);
    expect(occupiesSlot({ status: "pending_payment", holdExpiresAt: now }, now)).toBe(false); // expiry instant is released
  });
  it("confirmed bookings occupy; cancelled, no-show and expired never do", () => {
    expect(occupiesSlot({ status: "confirmed", holdExpiresAt: null }, now)).toBe(true);
    for (const status of ["cancelled", "no-show", "expired"]) expect(occupiesSlot({ status, holdExpiresAt: null }, now)).toBe(false);
  });
  it("the query fragment releases lapsed holds the same way", () => {
    expect(occupyingWhere(now)).toEqual({
      status: { notIn: ["cancelled", "no-show", "expired"] },
      NOT: { status: "pending_payment", holdExpiresAt: { lte: now } },
    });
  });
});

describe("token numbers are not reused after a hold expires", () => {
  it("the next booking continues after the expired number", () => {
    // Tokens 1-3 issued, token 3 was a hold that lapsed: the highest issued number is still 3.
    expect(assignToken({ startMin: 600, endMin: 840, minutesPerToken: 15 }, 3)).toEqual({ number: 4, estimatedMin: 645 });
  });
});

describe("group service holds count against capacity", () => {
  const start = mins(60).getTime();
  const at = (a: { status: string; holdExpiresAt: Date | null }) => ({ start, durationMin: 60, ...a });
  const existing = [at({ status: "confirmed", holdExpiresAt: null }), at(live), at(lapsed)];
  const occupying = existing.filter((e) => occupiesSlot(e, now));

  it("a live hold takes a spot; a lapsed one frees it", () => {
    expect(occupying).toHaveLength(2);
    expect(hasBookingConflict({ start, durationMin: 60, capacity: 2, existing: occupying })).toBe(true);
    expect(hasBookingConflict({ start, durationMin: 60, capacity: 3, existing: occupying })).toBe(false);
  });
});

describe("payment success", () => {
  it("confirms a live hold", () => expect(onPaid(live, now)).toBe("confirm"));
  it("refunds when the hold lapsed, expired or was cancelled meanwhile", () => {
    expect(onPaid(lapsed, now)).toBe("refund");
    expect(onPaid({ status: "expired", holdExpiresAt: mins(-30) }, now)).toBe("refund");
    expect(onPaid({ status: "cancelled", holdExpiresAt: null }, now)).toBe("refund");
  });
  it("does nothing twice (already confirmed or completed)", () => {
    expect(onPaid({ status: "confirmed", holdExpiresAt: null }, now)).toBe("noop");
    expect(onPaid({ status: "completed", holdExpiresAt: null }, now)).toBe("noop");
  });
});

describe("money on cancel (owner rule 2026-10-25)", () => {
  it("business cancels: everything refunded, fee included", () => {
    expect(settleCancellation({ by: "business", paidMinor: 51000 })).toEqual({ refundMinor: 51000, creditMinor: 0 });
    expect(settleCancellation({ by: "business", paidMinor: 1000 })).toEqual({ refundMinor: 1000, creditMinor: 0 });
  });
  it("customer cancels: nothing refunded, the whole amount becomes credit for the next booking", () => {
    expect(settleCancellation({ by: "customer", paidMinor: 1000 })).toEqual({ refundMinor: 0, creditMinor: 1000 });
    expect(settleCancellation({ by: "customer", paidMinor: 51000 })).toEqual({ refundMinor: 0, creditMinor: 51000 });
  });
  it("cutoff maths", () => {
    expect(beforeCancellationCutoff(mins(120), 2, now)).toBe(true);
    expect(beforeCancellationCutoff(mins(119), 2, now)).toBe(false);
    expect(beforeCancellationCutoff(mins(1), 0, now)).toBe(true);
  });
});

describe("when a charge applies", () => {
  const cfg = { country: "IN", platformFeeMinorIN: 1000, mode: "BOOKING_FEE_ONLY" as const, payer: "CUSTOMER" as const };
  it("India Free public booking: Rs 10; paid plan: nothing; international: nothing", () => {
    expect(computeCharge({ ...cfg, priceMinor: 50000 }).chargeMinor).toBe(1000);
    expect(computeCharge({ ...cfg, platformFeeMinorIN: 0, priceMinor: 50000 }).chargeMinor).toBe(0);
    expect(computeCharge({ ...cfg, country: "US", priceMinor: 50000 }).chargeMinor).toBe(0);
  });
});
