import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }));
const attemptNow = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/prisma", () => ({
  prisma: { notificationOutbox: { findFirst: db.findFirst, findUnique: db.findUnique, findMany: db.findMany, updateMany: db.updateMany } },
}));
vi.mock("@/lib/notifications/process", () => ({ attemptNow }));

import {
  adminLogWhere, eventLabel, failureRate, listLog, maskEmail, maskPhone, ownerLogWhere, parseLogFilters,
  redactError, resendBlocker, resendFailed,
} from "@/lib/notifications/log";
import { MAX_ATTEMPTS } from "@/lib/notifications/policy";

const NOW = new Date("2026-11-03T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("delivery log filters (chunk 6)", () => {
  it("drops unknown values and defaults to 7 days, page 1", () => {
    expect(parseLogFilters({ status: "BOGUS", channel: "EMAIL", days: "5", page: "-3", q: "  x  " }))
      .toEqual({ status: undefined, channel: "EMAIL", audience: undefined, days: 7, q: "x", page: 1 });
    expect(parseLogFilters({ status: "FAILED", days: "30", page: "2" })).toMatchObject({ status: "FAILED", days: 30, page: 2 });
  });

  it("owner where is always pinned to the session business", () => {
    const f = parseLogFilters({ q: "a@b.test", status: "SENT" });
    const w = ownerLogWhere("biz_1", f, NOW);
    expect(w.businessId).toBe("biz_1");
    expect(w.status).toBe("SENT");
    expect(JSON.stringify(w.OR)).not.toContain("businessId");
  });

  it("admin search matches recipients exactly only, so masking cannot be bypassed by prefix search", () => {
    const w = adminLogWhere(parseLogFilters({ q: "Jo@Example.com" }), NOW, ["b1"]);
    const or = w.OR as Record<string, unknown>[];
    expect(or).toContainEqual({ recipient: "jo@example.com" });
    expect(or.some((c) => typeof c.recipient === "object")).toBe(false);
    expect(or).toContainEqual({ businessId: { in: ["b1"] } });
  });
});

describe("masking and redaction", () => {
  it("masks emails and phones", () => {
    expect(maskEmail("jane.doe@gmail.com")).toBe("j•••@g•••.com");
    expect(maskEmail("bad")).toBe("•••");
    expect(maskPhone("+91 98765 43210")).toBe("•••3210");
    expect(maskPhone("12")).toBe("•••");
  });

  it("hides tokens and long secrets in provider errors", () => {
    const e = redactError("bad link https://x.test/reset-password?token=abc123&x=1 Bearer sk_live_1 key 0123456789abcdef0123456789abcdef");
    expect(e).toContain("token=[hidden]");
    expect(e).not.toContain("abc123");
    expect(e).not.toContain("sk_live_1");
    expect(e).not.toContain("0123456789abcdef0123456789abcdef");
    expect(redactError("timeout ".repeat(60), 50)?.length).toBe(50);
    expect(redactError(null)).toBeNull();
  });

  it("labels events and computes failure rate over finished sends", () => {
    expect(eventLabel("alert.booking.created")).toBe("Alert: booking created");
    expect(eventLabel("booking.meeting_link")).toBe("Booking: meeting link");
    expect(failureRate(3, 1)).toBe(0.25);
    expect(failureRate(0, 0)).toBe(0);
  });
});

describe("resend rules", () => {
  const failed = { status: "FAILED", event: "booking.created", createdAt: hoursAgo(1), expiresAt: null };
  it("allows recent failed non-auth rows only", () => {
    expect(resendBlocker(failed, NOW)).toBeNull();
    expect(resendBlocker({ ...failed, status: "SENT" }, NOW)).toMatch(/only failed/);
    expect(resendBlocker({ ...failed, event: "auth.reset" }, NOW)).toMatch(/sign-in/);
    expect(resendBlocker({ ...failed, expiresAt: hoursAgo(0.1) }, NOW)).toBe("expired");
    expect(resendBlocker({ ...failed, createdAt: hoursAgo(24 * 8) }, NOW)).toMatch(/7 days/);
  });

  it("owner resend is scoped to their business; another business's row is not found", async () => {
    db.findFirst.mockResolvedValue(null);
    const r = await resendFailed("n1", "biz_1", NOW);
    expect(r).toEqual({ ok: false, code: 404, error: "Not found" });
    expect(db.findFirst.mock.calls[0][0].where).toEqual({ id: "n1", businessId: "biz_1" });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("blocked rows are refused without a write", async () => {
    db.findFirst.mockResolvedValue({ ...failed, event: "auth.verify" });
    expect(await resendFailed("n1", "biz_1", NOW)).toMatchObject({ ok: false, code: 409 });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("requeues as the last allowed attempt and tries once now", async () => {
    db.findFirst.mockResolvedValue(failed);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUnique.mockResolvedValue({ status: "SENT" });
    expect(await resendFailed("n1", "biz_1", NOW)).toEqual({ ok: true, status: "SENT" });
    const call = db.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "n1", status: "FAILED", businessId: "biz_1" });
    expect(call.data).toMatchObject({ status: "PENDING", attempts: MAX_ATTEMPTS - 1, error: null });
    expect(attemptNow).toHaveBeenCalledWith(["n1"]);
  });

  it("a concurrent resend loses the race cleanly", async () => {
    db.findFirst.mockResolvedValue(failed);
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await resendFailed("n1", undefined, NOW)).toMatchObject({ ok: false, code: 409 });
    expect(db.updateMany.mock.calls[0][0].where).toEqual({ id: "n1", status: "FAILED" });
    expect(attemptNow).not.toHaveBeenCalled();
  });
});

describe("listLog", () => {
  it("never selects payload or secret, masks for admin, and redacts errors", async () => {
    db.findMany.mockResolvedValue([{
      id: "n1", businessId: "b1", event: "booking.created", audience: "CUSTOMER", channel: "EMAIL", recipient: "jane@x.com",
      status: "FAILED", attempts: 6, error: "https://a.test/?token=zzz", createdAt: hoursAgo(1), sentAt: null, expiresAt: null,
    }]);
    const { rows, hasMore } = await listLog({}, 1, { mask: true, now: NOW });
    const select = db.findMany.mock.calls[0][0].select;
    expect(select.payload).toBeUndefined();
    expect(select.secret).toBeUndefined();
    expect(hasMore).toBe(false);
    expect(rows[0]).toMatchObject({ recipient: "j•••@x•••.com", error: "https://a.test/?token=[hidden]", resendable: true });
  });
});
