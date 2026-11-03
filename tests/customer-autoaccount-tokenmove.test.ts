import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirstSession: vi.fn(),
}));
const owned = vi.hoisted(() => ({ findOwned: vi.fn() }));
const day = vi.hoisted(() => ({ loadTokenDay: vi.fn() }));
const issue = vi.hoisted(() => ({ result: { ok: true as boolean } }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenSession: { findFirst: db.findFirstSession },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/customerAppointments", () => ({ findOwned: owned.findOwned }));
vi.mock("@/lib/tokenBooking", () => ({ loadTokenDay: day.loadTokenDay }));
vi.mock("@/lib/tokens", async (orig) => {
  const real = await orig<typeof import("@/lib/tokens")>();
  return {
    ...real,
    // Run the write with a fake transaction, as the advisory-locked store would.
    issueToken: vi.fn(async (_store, _session, _date, write) => {
      if (!issue.result.ok) return { ok: false };
      const assignment = { number: 9, estimatedMin: 10 * 60 + 40 };
      const tx = { appointment: { updateMany: db.updateMany, create: db.create, update: db.update } };
      return { ok: true, assignment, value: await write(tx, assignment) };
    }),
  };
});
vi.mock("@/lib/notifications/enqueue", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/business", () => ({ ownerAlert: vi.fn(async () => null) }));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: vi.fn(async () => {}) }));

import { inviteAction, INVITE_COOLDOWN_MS } from "@/lib/customerInvite";
import { authEmail } from "@/lib/notifications/events";
import { tokenMoveBlocker } from "@/lib/customerView";
import { moveTokenByCustomer, tokenMoveOptions } from "@/lib/customerTokenMove";

const NOW = new Date("2026-11-03T06:00:00Z");

describe("account at booking", () => {
  it("creates a passwordless account and sends the setup link for a new email", () => {
    expect(inviteAction(null, null, NOW)).toEqual({ notice: "created", create: true, sendLink: true });
  });
  it("leaves verified accounts alone", () => {
    expect(inviteAction({ emailVerified: NOW, password: "x" }, null, NOW)).toEqual({ notice: null, create: false, sendLink: false });
  });
  it("never sends a setup link to an account someone created with a password", () => {
    expect(inviteAction({ emailVerified: null, password: "hash" }, null, NOW)).toMatchObject({ notice: "verify", sendLink: false });
  });
  it("re-sends the setup link at most once a day", () => {
    const pending = { emailVerified: null, password: null };
    expect(inviteAction(pending, new Date(NOW.getTime() - 60_000), NOW).sendLink).toBe(false);
    expect(inviteAction(pending, new Date(NOW.getTime() - INVITE_COOLDOWN_MS), NOW).sendLink).toBe(true);
  });
  it("setup email links to the set-password screen and counts as a verification", () => {
    const n = authEmail({ template: "customer_account_setup", userId: "c1", to: "a@x.co", name: "A", token: "tok", baseUrl: "https://calvy.io" });
    expect(n.secret).toBe("https://calvy.io/my/verify-email?setup=1&token=tok");
    expect(n.event).toBe("auth.verify");
    expect(JSON.stringify(n.payload)).not.toContain("tok");
  });
});

describe("customer token move", () => {
  const base = {
    id: "a1", businessId: "b1", clientId: "cl1", serviceId: "s1", staffId: "st1", status: "confirmed",
    date: new Date("2026-11-04T05:00:00Z"), endAt: new Date("2026-11-04T05:10:00Z"), estimatedAt: new Date("2026-11-04T05:00:00Z"),
    duration: 10, price: 500, notes: null, patientName: null, isOnline: false, paymentMode: "prepaid", source: "ONLINE",
    tokenNumber: 4, tokenSessionId: "ts1", sessionDate: new Date("2026-11-04T00:00:00Z"), queueState: null, carriedFromId: null,
    client: { id: "cl1", name: "Riya", email: "riya@x.co" }, service: { name: "Checkup" }, staff: { name: "Dr A" }, tokenSession: { name: "Morning" },
    business: { name: "Clinic", slug: "clinic", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null, cancellationCutoffHours: 0, maxAdvanceDays: 90 },
  };
  const session = { id: "ts2", businessId: "b1", staffId: "st1", name: "Evening", startMin: 600, endMin: 720, minutesPerToken: 10, weekdays: [0, 1, 2, 3, 4, 5, 6], isActive: true };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    issue.result.ok = true;
    owned.findOwned.mockResolvedValue({ ...base });
    day.loadTokenDay.mockResolvedValue({ ok: true, sessions: [{ id: "ts2", name: "Evening", left: 5 }], nextAvailable: null });
    db.findFirstSession.mockResolvedValue(session);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.create.mockResolvedValue({ id: "ph1" });
    db.update.mockResolvedValue({});
  });

  it("allows one move only", () => {
    expect(tokenMoveBlocker({ tokenNumber: 4, carriedFromId: null })).toBeNull();
    expect(tokenMoveBlocker({ tokenNumber: 4, carriedFromId: "ph0" })).toMatch(/already moved/);
    expect(tokenMoveBlocker({ tokenNumber: null, carriedFromId: "x" })).toBeNull();
  });

  it("refuses the same day (the front desk keeps the place in that queue)", async () => {
    const r = await tokenMoveOptions("riya@x.co", "a1", "2026-11-04");
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a token the front desk is already handling, or one moved before", async () => {
    owned.findOwned.mockResolvedValueOnce({ ...base, queueState: "SERVING" });
    expect(await tokenMoveOptions("riya@x.co", "a1", "2026-11-06")).toMatchObject({ ok: false, code: "STATUS" });
    owned.findOwned.mockResolvedValueOnce({ ...base, carriedFromId: "ph0" });
    expect(await tokenMoveOptions("riya@x.co", "a1", "2026-11-06")).toMatchObject({ ok: false, code: "MOVED_ONCE" });
  });

  it("someone else's booking is not found", async () => {
    owned.findOwned.mockResolvedValueOnce(null);
    expect(await moveTokenByCustomer("other@x.co", "a1", "2026-11-06", "ts2")).toMatchObject({ ok: false, status: 404 });
  });

  it("moves the same booking to the end of the new queue and keeps the old number taken", async () => {
    const r = await moveTokenByCustomer("riya@x.co", "a1", "2026-11-06", "ts2");
    expect(r).toMatchObject({ ok: true, token: 9, estimatedTime: "10:40" });
    const move = db.updateMany.mock.calls[0][0];
    expect(move.where).toMatchObject({ id: "a1", carriedFromId: null, tokenSessionId: "ts1", tokenNumber: 4 });
    expect(move.data).toMatchObject({ tokenSessionId: "ts2", tokenNumber: 9, queueState: null, notPresentCount: 0, reminderSent: false });
    expect(move.data.price).toBeUndefined(); // payment and price stay on the same booking
    const placeholder = db.create.mock.calls[0][0].data;
    expect(placeholder).toMatchObject({ status: "cancelled", queueState: "MOVED", tokenSessionId: "ts1", tokenNumber: 4, price: 0, paymentStatus: "unpaid" });
    expect(db.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { carriedFromId: "ph1" } });
  });

  it("a stale token (changed meanwhile) is refused, and a full session says so", async () => {
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await moveTokenByCustomer("riya@x.co", "a1", "2026-11-06", "ts2")).toMatchObject({ ok: false, code: "STATUS" });
    expect(db.create).not.toHaveBeenCalled();
    issue.result.ok = false;
    expect(await moveTokenByCustomer("riya@x.co", "a1", "2026-11-06", "ts2")).toMatchObject({ ok: false, code: "SESSION_FULL" });
  });

  it("only sessions offered that day can be chosen", async () => {
    expect(await moveTokenByCustomer("riya@x.co", "a1", "2026-11-06", "nope")).toMatchObject({ ok: false, status: 400 });
  });
});
