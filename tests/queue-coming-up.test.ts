import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const db: Record<string, any> = {
    tokenSession: { findFirst: vi.fn() },
    appointment: { findMany: vi.fn(), update: vi.fn(async () => ({})), findUnique: vi.fn(), findFirst: vi.fn() },
    business: { findUnique: vi.fn() },
    staff: { findUnique: vi.fn() },
    $executeRaw: vi.fn(async () => 0),
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return { db, notify: vi.fn(async (..._items: unknown[]) => {}), credit: vi.fn(async () => null) };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: mocks.notify }));
vi.mock("@/lib/creditDb", () => ({ creditClosedBooking: mocks.credit }));

import { runQueueAction, type QueueBusiness } from "@/lib/queueDb";
import { epochAllowed, nearTokens, planNear } from "@/lib/queueNear";
import { queueNext, statusChange, type Notice } from "@/lib/notifications/events";
import { queueNextSendCheck } from "@/lib/notifications/queueNextRules";
import { followUpDeadlineLabel } from "@/lib/notifications/followUpNotice";
import { clampTokenNextAhead, prefsInputSchema, resolvePrefs } from "@/lib/notifications/prefs";
import { idempotencyKey } from "@/lib/notifications/policy";
import { renderTemplate } from "@/lib/notifications/templates";
import { buildWhatsAppMessage } from "@/lib/whatsapp/events";
import { TEMPLATE_DEFS } from "@/lib/whatsapp/templates";

process.env.NEXTAUTH_SECRET = "test-secret";
const biz: QueueBusiness = { id: "biz1", timezone: "Asia/Kolkata", name: "Sunrise", packId: "CLINIC", termsOverride: null, currency: "INR" };
const session = { id: "s1", businessId: "biz1", name: "Morning", startMin: 540, endMin: 720, minutesPerToken: 10, staffId: null, weekdays: [1], isActive: true };
const token = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${n}`, businessId: "biz1", tokenNumber: n, queuePosition: n, queueState: n === 1 ? "SERVING" : "WAITING", notPresentCount: 0, carriedFromId: null,
  servingStartedAt: n === 1 ? new Date("2026-11-02T03:30:00Z") : null, status: "confirmed", source: "ONLINE", isOnline: false, meetingUrl: null,
  patientName: null, price: 500, clientId: `c${n}`,
  client: { name: `Client ${n}`, email: `c${n}@example.com`, phone: null }, service: { name: "Checkup", meetingUrl: null }, staff: { meetingUrl: null }, ...over,
});
const queue = (n: number, over: Record<number, Record<string, unknown>> = {}) => Array.from({ length: n }, (_, i) => token(i + 1, over[i + 1] ?? {}));
const next = () => runQueueAction(biz, { sessionId: "s1", date: "2026-11-02", action: "next" });
const notPresent = (id: string) => runQueueAction(biz, { sessionId: "s1", date: "2026-11-02", action: "not_present", appointmentId: id });
type Queued = { event: string; subjectId: string; version?: number; skipReason?: string; payload: Record<string, any> };
const coming = () => (mocks.notify.mock.calls.flatMap((c) => c).filter(Boolean) as Queued[]).filter((q) => q.event === "booking.queue_next");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.tokenSession.findFirst.mockResolvedValue(session);
  mocks.db.business.findUnique.mockResolvedValue({ name: "Sunrise", slug: "sunrise", packId: "CLINIC", termsOverride: null, currency: "INR", notificationPrefs: null });
});

describe("planNear (pure)", () => {
  it("N tokens ahead: the head (being served) is never 'coming up'; places 1..N are", () => {
    expect(nearTokens(["a", "b", "c", "d", "e", "f"], 3)).toEqual([{ id: "b", ahead: 1 }, { id: "c", ahead: 2 }, { id: "d", ahead: 3 }]);
    expect(nearTokens(["a", "b", "c"], 1)).toEqual([{ id: "b", ahead: 1 }]);
    expect(nearTokens(["a"], 3)).toEqual([]);
  });
  it("only epochs 0 and 1 may send: at most two messages per booking", () => {
    expect([0, 1, 2, 3, -1].map(epochAllowed)).toEqual([true, true, false, false, false]);
  });
  it("a token that is not waiting, or already moved back twice, is skipped", () => {
    const info = { b: { waiting: false, notPresentCount: 0 }, c: { waiting: true, notPresentCount: 2 }, d: { waiting: true, notPresentCount: 1 } };
    expect(planNear({ order: ["a", "b", "c", "d"], n: 3, info })).toEqual([{ id: "d", ahead: 3, epoch: 1 }]);
  });
  it("a token just moved back but still within N burns its epoch without sending", () => {
    const d = planNear({ order: ["a", "b", "c"], n: 3, info: { b: { waiting: true, notPresentCount: 0 }, c: { waiting: true, notPresentCount: 1 } }, movedBackId: "c" });
    expect(d).toEqual([{ id: "b", ahead: 1, epoch: 0 }, { id: "c", ahead: 2, epoch: 1, markOnly: "still near after being moved back" }]);
  });
  it("moved back beyond N: nothing now; the epoch is free for when N is reached again", () => {
    const d = planNear({ order: ["a", "b", "c", "d", "e"], n: 1, info: { b: { waiting: true, notPresentCount: 0 }, e: { waiting: true, notPresentCount: 1 } }, movedBackId: "e" });
    expect(d.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("the whole life of one booking (max 2 sends)", () => {
  const key = (n: { id: string; epoch: number }) => idempotencyKey({ event: "booking.queue_next", subjectId: n.id, version: n.epoch, recipient: "x@example.test", channel: "EMAIL" });
  it("first arrival -> sent; moved back and far -> quiet; near again -> sent; moved back again -> never again", () => {
    const sent = new Set<string>();
    const step = (order: string[], count: number, movedBack?: string) => {
      for (const d of planNear({ order, n: 3, info: Object.fromEntries(order.map((id) => [id, { waiting: true, notPresentCount: id === "c" ? count : 0 }])), movedBackId: movedBack })) {
        if (d.id === "c" && !d.markOnly) sent.add(key(d));
        if (d.id === "c" && d.markOnly) sent.add(key(d)); // the marker takes the key too
      }
    };
    step(["a", "x1", "x2", "x3", "c"], 0);                 // 4 ahead: not yet
    expect(sent.size).toBe(0);
    step(["a", "x2", "x3", "c"], 0);                       // 3 ahead: sent (epoch 0)
    step(["a", "x3", "c"], 0);                             // still near: same key, nothing new
    expect(sent.size).toBe(1);
    step(["a", "x3", "x4", "x5", "x6", "c"], 1, "c");      // moved back beyond N: quiet
    expect(sent.size).toBe(1);
    step(["a", "x6", "x5", "c"], 1);                       // N reached again after the move-back: epoch 1 sent
    expect(sent.size).toBe(2);
    step(["a", "x5", "c"], 1);                             // same epoch: nothing
    step(["a", "x5", "c"], 2, "c");                        // moved back a second time
    step(["a", "x5", "c"], 2);
    expect(sent.size).toBe(2);                             // never a third
  });
  it("still near after a move-back: no second message for that epoch", () => {
    const keys = new Set<string>();
    for (const d of planNear({ order: ["a", "x", "c"], n: 3, info: { x: { waiting: true, notPresentCount: 0 }, c: { waiting: true, notPresentCount: 1 } }, movedBackId: "c" })) keys.add(key(d));
    for (const d of planNear({ order: ["a", "c"], n: 3, info: { c: { waiting: true, notPresentCount: 1 } } })) keys.add(key(d));
    expect([...keys].filter((k) => k.includes(":c:1:")).length).toBe(1); // the marker and the later "send" share one key, so it dedupes
  });
});

describe("queue actions send 'your turn is coming up' (default 3 ahead)", () => {
  it("serving the next token tells exactly the tokens 1..3 places behind, with token number and tracking link", async () => {
    mocks.db.appointment.findMany.mockResolvedValue(queue(6)); // a1 serving; Next serves a2 -> order a2,a3,a4,a5,a6 -> a3,a4,a5 are 1..3 ahead
    await next();
    const n = coming();
    expect(n.map((q) => q.subjectId)).toEqual(["a3", "a4", "a5"]);
    expect(n.map((q) => q.payload.ahead)).toEqual([1, 2, 3]);
    expect(n[0]).toMatchObject({ version: 0, payload: { token: { number: 3 }, businessName: "Sunrise", trackUrl: expect.stringContaining("/sunrise/q/") } });
  });
  it("uses the business setting (1 to 5)", async () => {
    mocks.db.business.findUnique.mockResolvedValue({ name: "Sunrise", slug: "sunrise", packId: "CLINIC", termsOverride: null, currency: "INR", notificationPrefs: { customer: { tokenNextAhead: 1 } } });
    mocks.db.appointment.findMany.mockResolvedValue(queue(6));
    await next();
    expect(coming().map((q) => q.subjectId)).toEqual(["a3"]);
    mocks.notify.mockClear();
    mocks.db.business.findUnique.mockResolvedValue({ name: "Sunrise", slug: "sunrise", packId: "CLINIC", termsOverride: null, currency: "INR", notificationPrefs: { customer: { tokenNextAhead: 5 } } });
    mocks.db.appointment.findMany.mockResolvedValue(queue(9));
    await next();
    expect(coming()).toHaveLength(5);
  });
  it("customers with no email, tokens already moved back twice, and a one-person queue produce nothing", async () => {
    mocks.db.appointment.findMany.mockResolvedValue(queue(4, { 3: { client: { name: "Walk-in", email: null, phone: null } }, 4: { notPresentCount: 2 } }));
    await next();
    expect(coming().map((q) => q.subjectId)).toEqual([]);
    mocks.notify.mockClear();
    mocks.db.appointment.findMany.mockResolvedValue(queue(1));
    await next();
    expect(coming()).toHaveLength(0);
  });
  it("the same action repeated produces the same keys (the outbox dedupes it)", async () => {
    mocks.db.appointment.findMany.mockResolvedValue(queue(5));
    await next();
    const first = coming().map((q) => `${q.subjectId}:${q.version}`);
    mocks.notify.mockClear();
    await next();
    expect(coming().map((q) => `${q.subjectId}:${q.version}`)).toEqual(first);
  });
  it("a missed call: the moved-back token inside N has its epoch used, not messaged; the others still are", async () => {
    mocks.db.appointment.findMany.mockResolvedValue(queue(3)); // a1 serving misses; order becomes a2(serving), a3, a1
    await notPresent("a1");
    const byId = Object.fromEntries(coming().map((q) => [q.subjectId, q]));
    expect(byId.a3).toMatchObject({ version: 0, payload: { ahead: 1 } });
    expect(byId.a3.skipReason).toBeUndefined();
    expect(byId.a1).toMatchObject({ version: 1, skipReason: "still near after being moved back" });
  });
  it("a notification failure never fails the queue action", async () => {
    mocks.db.appointment.findMany.mockResolvedValue(queue(6));
    mocks.notify.mockRejectedValueOnce(new Error("db down"));
    await expect(next()).resolves.toMatchObject({ outcome: "advanced" });
  });
});

describe("send-time check and the email", () => {
  it("skipped once the token is served, closed, cancelled or gone", async () => {
    const find = mocks.db.appointment.findUnique;
    find.mockResolvedValueOnce({ status: "confirmed", queueState: "WAITING", tokenNumber: 4 });
    expect(await queueNextSendCheck({ appointmentId: "a4" })).toBeNull();
    find.mockResolvedValueOnce({ status: "confirmed", queueState: "SERVING", tokenNumber: 4 });
    expect(await queueNextSendCheck({ appointmentId: "a4" })).toBe("token is no longer waiting");
    find.mockResolvedValueOnce({ status: "cancelled", queueState: "CANCELLED", tokenNumber: 4 });
    expect(await queueNextSendCheck({ appointmentId: "a4" })).toBe("booking cancelled");
    find.mockResolvedValueOnce(null);
    expect(await queueNextSendCheck({ appointmentId: "a4" })).toBe("booking deleted");
  });
  it("the email is short: one line, the tracking link", async () => {
    const n: Notice = { appointmentId: "a4", businessId: "biz1", to: "c4@example.com", payload: { clientName: "Client 4", businessName: "Sunrise", serviceName: "Checkup", date: "Mon 2 Nov", time: "9:30 AM", token: { number: 4, estimatedTime: "9:30 AM", sessionName: "Morning" }, trackUrl: "https://calvy.io/sunrise/q/a4.sig" } as never };
    const item = queueNext(n, 2, 0)!;
    expect(item).toMatchObject({ event: "booking.queue_next", template: "queue_next", version: 0 });
    const r = await renderTemplate(item.template, item.payload);
    expect(r.subject).toBe("Your turn is coming up at Sunrise");
    expect(r.text).toContain("2 people are ahead of you");
    expect(r.text).toContain("https://calvy.io/sunrise/q/a4.sig");
    expect(queueNext({ ...n, to: null }, 2, 0)).toBeNull();
  });
  it("the setting is clamped to 1..5 and validated on save; default 3", () => {
    expect([undefined, 0, 9, 2.4, "x"].map(clampTokenNextAhead)).toEqual([3, 1, 5, 2, 3]);
    expect(resolvePrefs(null).customer.tokenNextAhead).toBe(3);
    const full = { ...resolvePrefs(null), customer: { ...resolvePrefs(null).customer, tokenNextAhead: 5 } };
    expect(prefsInputSchema.safeParse(full).success).toBe(true);
    expect(prefsInputSchema.safeParse({ ...full, customer: { ...full.customer, tokenNextAhead: 6 } }).success).toBe(false);
  });
  it("WhatsApp: token_next with the tracking button, nothing without a link; both new switches default ON", () => {
    const p = { clientName: "Riya Kapoor", businessName: "Sunrise", token: { number: 4, estimatedTime: "9:30 AM", sessionName: "M" }, trackUrl: "https://calvy.io/sunrise/q/a4.sig" };
    expect(buildWhatsAppMessage("booking.queue_next", p, "CUSTOMER")).toEqual({ key: "token_next", params: ["Riya", "Sunrise", "4"], buttonSuffix: "a4.sig" });
    expect(buildWhatsAppMessage("booking.queue_next", { ...p, trackUrl: undefined }, "CUSTOMER")).toBeNull();
    expect(resolvePrefs(null).whatsapp).toMatchObject({ turnSoon: true, followUp: true });
  });
});

describe("free follow-up deadline rides on the thank-you", () => {
  const visit = (over: Record<string, unknown> = {}, days = 30) => ({
    id: "v1", status: "completed", followUpOfId: null, staffId: "s1", serviceId: "svc1", date: new Date("2026-11-02T05:00:00Z"), patientName: null,
    business: { timezone: "Asia/Kolkata", followUpDays: days }, ...over,
  });
  const NOW = new Date("2026-11-02T10:00:00Z");
  beforeEach(() => mocks.db.appointment.findFirst.mockResolvedValue(null));
  it("completed visit with follow-ups on: deadline = visit date + days, as a label", async () => {
    expect(await followUpDeadlineLabel(visit(), NOW)).toMatch(/Dec/); // 2 Nov + 30 days = 2 Dec
  });
  it("nothing when off, no doctor, already a follow-up, already used, or the window passed", async () => {
    expect(await followUpDeadlineLabel(visit({}, 0), NOW)).toBeUndefined();
    expect(await followUpDeadlineLabel(visit({ staffId: null }), NOW)).toBeUndefined();
    expect(await followUpDeadlineLabel(visit({ followUpOfId: "v0" }), NOW)).toBeUndefined();
    mocks.db.appointment.findFirst.mockResolvedValue({ id: "f1" });
    expect(await followUpDeadlineLabel(visit(), NOW)).toBeUndefined();
    mocks.db.appointment.findFirst.mockResolvedValue(null);
    expect(await followUpDeadlineLabel(visit({}, 5), new Date("2026-12-30T10:00:00Z"))).toBeUndefined();
  });
  const notice: Notice = { appointmentId: "v1", businessId: "biz1", to: "c@example.com", payload: { clientName: "Riya Kapoor", businessName: "Sunrise", serviceName: "Checkup", date: "Mon 2 Nov", time: "10:30 AM" } as never };
  it("one message: the completed notice carries the deadline on email and WhatsApp, no separate follow-up message", async () => {
    const item = statusChange(notice, "completed", "https://calvy.io/sunrise", "2 Dec")!;
    expect(item.payload).toMatchObject({ followUpUntil: "2 Dec" });
    expect((await renderTemplate(item.template, item.payload)).text).toContain("one free follow-up until 2 Dec");
    expect(buildWhatsAppMessage("booking.completed", item.payload, "CUSTOMER")).toEqual({ key: "visit_thanks_follow_up", params: ["Riya", "Sunrise", "Mon 2 Nov, 10:30 AM", "Sunrise", "2 Dec"] });
    expect(TEMPLATE_DEFS.some((d) => d.key === "follow_up_offer")).toBe(false);
  });
  it("without a deadline: the plain thank-you, on both channels", async () => {
    const item = statusChange(notice, "completed", "https://calvy.io/sunrise")!;
    expect(item.payload).not.toHaveProperty("followUpUntil");
    expect((await renderTemplate(item.template, item.payload)).text).not.toContain("follow-up");
    expect(buildWhatsAppMessage("booking.completed", item.payload, "CUSTOMER")?.key).toBe("visit_thanks");
    const noShow = statusChange(notice, "no_show", undefined, "2 Dec")!;
    expect(noShow.payload).not.toHaveProperty("followUpUntil"); // a missed visit never offers one
    expect(buildWhatsAppMessage("booking.no_show", noShow.payload, "CUSTOMER")?.key).toBe("booking_no_show");
  });
});
