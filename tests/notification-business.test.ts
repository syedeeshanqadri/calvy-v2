import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// step-3/business-events-prefs: owner alerts, welcome + live, review request, daily summary and the settings that
// switch them. Fake outbox with a unique key, like the DB.

const fake = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state = {
    rows: [] as Row[],
    businesses: {} as Record<string, Row>,
    optouts: [] as { businessId: string; recipient: string }[],
    counts: { created: 3, paid: 1200 },
  };
  const f = {
    state,
    business: {
      findUnique: vi.fn(async ({ where }: any) => state.businesses[where.id] ?? null),
      findMany: vi.fn(async ({ where }: any) => {
        if (where.id) return where.id.in.map((id: string) => ({ id, notificationPrefs: state.businesses[id]?.notificationPrefs ?? null }));
        return Object.values(state.businesses).filter((b) => (b.notificationPrefs as any)?.dailySummary === true);
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(state.businesses[where.id], data)),
    },
    notificationOptOut: {
      findMany: vi.fn(async ({ where }: any) => state.optouts.filter((o) => where.businessId.in.includes(o.businessId) && where.recipient.in.includes(o.recipient))),
    },
    notificationOutbox: {
      createMany: vi.fn(async ({ data }: any) => {
        for (const d of data) if (!state.rows.some((r) => r.idempotencyKey === d.idempotencyKey)) state.rows.push({ id: `n${state.rows.length + 1}`, status: "PENDING", ...d });
        return { count: data.length };
      }),
      findMany: vi.fn(async ({ where }: any) =>
        state.rows.filter((r) => where.idempotencyKey.in.includes(r.idempotencyKey) && (!where.status || r.status === where.status))
          .map((r) => ({ id: r.id, idempotencyKey: r.idempotencyKey }))),
    },
    appointment: {
      count: vi.fn(async () => state.counts.created),
      groupBy: vi.fn(async () => [{ status: "completed", _count: { _all: 2 } }, { status: "cancelled", _count: { _all: 1 } }]),
      aggregate: vi.fn(async () => ({ _sum: { price: state.counts.paid } })),
      findMany: vi.fn(async () => [{ date: new Date("2026-11-03T08:30:00Z"), notes: null, patientName: null, client: { name: "Riya Kapoor" }, service: { name: "Checkup" } }]),
    },
  };
  return f;
});
vi.mock("@/lib/prisma", () => ({ prisma: fake }));
vi.mock("@/lib/getFeatures", () => ({ getEffectiveLimits: vi.fn(async () => ({ emailReminders: true })) }));
const session = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { enqueue } from "@/lib/notifications/enqueue";
import { prefsInputSchema, resolvePrefs } from "@/lib/notifications/prefs";
import { alertRecipient, businessAlert, ownerOnboarding, reviewRequest, REVIEW_DELAY_MS } from "@/lib/notifications/business";
import { enqueueDailySummaries, summaryDay } from "@/lib/notifications/summary";
import { renderTemplate } from "@/lib/notifications/templates";
import type { Notice } from "@/lib/notifications/events";

const NOW = new Date("2026-11-03T03:00:00Z"); // 08:30 in Kolkata
const REVIEW = "https://g.page/r/abc/review";
const biz = (over: Record<string, any> = {}) => ({
  id: "b1", name: "Sunrise", email: "desk@sunrise.test", timezone: "Asia/Kolkata", currency: "INR", googleReviewUrl: REVIEW,
  notificationPrefs: null, plan: "pro", planStatus: "active", trialEndsAt: null, owner: { email: "owner@sunrise.test" }, ...over,
});
const notice: Notice = {
  appointmentId: "a1", businessId: "b1", to: "riya@example.test",
  payload: { clientName: "Riya Kapoor", businessName: "Sunrise", serviceName: "Checkup", staffName: "Dr Rao", date: "Tuesday, November 3", time: "10:00 AM", duration: 30, price: 500, currency: "INR" },
};
const fullPrefs = (over: Record<string, any> = {}) => ({
  customer: { completed: true, reviewRequest: true }, business: { created: true, rescheduled: true, cancelled: true, paid: true, status: false },
  dailySummary: false, reminderLeadMinutes: [1440], ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.assign(fake.state, { rows: [], businesses: { b1: biz() }, optouts: [] });
  session.mockReset().mockResolvedValue({ user: { businessId: "b1" } });
});
afterEach(() => vi.useRealTimers());

describe("preferences", () => {
  it("defaults: alerts on except other status changes; summary off; review requests on", () => {
    expect(resolvePrefs(null)).toEqual(fullPrefs());
  });
  it("the settings page must send every field; reminder leads allowed, distinct, at most two", () => {
    expect(prefsInputSchema.safeParse(fullPrefs({ reminderLeadMinutes: [1440, 120] })).success).toBe(true);
    expect(prefsInputSchema.safeParse(fullPrefs({ reminderLeadMinutes: [] })).success).toBe(true);
    for (const bad of [[1440, 1440], [45], [60, 120, 180]]) expect(prefsInputSchema.safeParse(fullPrefs({ reminderLeadMinutes: bad })).success).toBe(false);
    expect(prefsInputSchema.safeParse({ ...fullPrefs(), extra: true }).success).toBe(false);
    expect(prefsInputSchema.safeParse({ ...fullPrefs(), business: { created: true } }).success).toBe(false);
  });
});

describe("owner alerts", () => {
  it("go to the business email, else the owner's login email", async () => {
    expect(await alertRecipient("b1")).toBe("desk@sunrise.test");
    fake.state.businesses.b1 = biz({ email: "  " });
    expect(await alertRecipient("b1")).toBe("owner@sunrise.test");
    fake.state.businesses.b1 = biz({ email: null, owner: null });
    expect(await alertRecipient("b1")).toBeNull();
    expect(businessAlert(notice, "created", null)).toBeNull();
  });
  it("one per event, apart from the customer's email; the business's switches decide", async () => {
    const created = businessAlert(notice, "created", "desk@sunrise.test")!;
    const status = businessAlert(notice, "status", "desk@sunrise.test", { version: "completed", statusLabel: "completed" })!;
    await enqueue(fake as never, [created, created, status]);
    expect(fake.state.rows.map((r) => [r.event, r.status, r.audience])).toEqual([
      ["alert.booking.created", "PENDING", "BUSINESS"],
      ["alert.booking.status", "SKIPPED", "BUSINESS"],
    ]);
    fake.state.businesses.b1 = biz({ notificationPrefs: { business: { created: false } } });
    await enqueue(fake as never, [businessAlert({ ...notice, appointmentId: "a2" }, "created", "desk@sunrise.test")!]);
    expect(fake.state.rows[2]).toMatchObject({ status: "SKIPPED", error: "turned off by the business" });
  });
  it("a reschedule alert carries both times, a customer action says so, in the pack's words", async () => {
    const a = businessAlert(notice, "rescheduled", "desk@sunrise.test", { version: "1>2", byCustomer: true, oldDate: "Monday, November 2", oldTime: "9:00 AM" })!;
    const m = await renderTemplate(a.template, a.payload, { terms: { packId: "FITNESS" } });
    expect(m.subject).toBe("Booking rescheduled by the customer: Riya Kapoor");
    expect(m.text).toContain("Was: Monday, November 2, 9:00 AM");
    expect(m.text).toContain("Now: Tuesday, November 3, 10:00 AM");
  });
});

describe("review request", () => {
  it("only with a valid review link and an email; sent 2 hours later", () => {
    expect(reviewRequest(notice, null)).toBeNull();
    expect(reviewRequest(notice, "https://evil.test/x")).toBeNull();
    expect(reviewRequest({ ...notice, to: null }, REVIEW)).toBeNull();
    const r = reviewRequest(notice, REVIEW, NOW)!;
    expect(r).toMatchObject({ event: "booking.review_request", audience: "CUSTOMER", payload: { reviewUrl: REVIEW } });
    expect(r.notBefore!.getTime() - NOW.getTime()).toBe(REVIEW_DELAY_MS);
  });
  it("once per booking; switched off by the business or the customer's unsubscribe", async () => {
    await enqueue(fake as never, [reviewRequest(notice, REVIEW)!, reviewRequest(notice, REVIEW)!]);
    expect(fake.state.rows).toHaveLength(1);
    expect(fake.state.rows[0].nextAttemptAt.getTime()).toBe(NOW.getTime() + REVIEW_DELAY_MS);
    fake.state.optouts = [{ businessId: "b1", recipient: "riya@example.test" }];
    await enqueue(fake as never, [reviewRequest({ ...notice, appointmentId: "a2" }, REVIEW)!]);
    expect(fake.state.rows[1]).toMatchObject({ status: "SKIPPED", error: "unsubscribed" });
  });
  it("carries the unsubscribe link (optional mail)", async () => {
    const r = reviewRequest(notice, REVIEW)!;
    const m = await renderTemplate(r.template, r.payload, undefined, { page: "https://x.test/u", oneClick: "https://x.test/api/u" });
    expect(m.headers?.["List-Unsubscribe"]).toContain("https://x.test/api/u");
  });
});

describe("welcome and live", () => {
  it("two transactional emails to the owner, once per business", async () => {
    const items = ownerOnboarding({ businessId: "b1", slug: "sunrise", businessName: "Sunrise", ownerName: "Asha Rao", ownerEmail: "owner@sunrise.test" });
    await enqueue(fake as never, [...items, ...items]);
    expect(fake.state.rows.map((r) => [r.event, r.template, r.status])).toEqual([
      ["account.created", "welcome", "PENDING"],
      ["business.live", "business_live", "PENDING"],
    ]);
    expect(String(fake.state.rows[1].payload.websiteUrl)).toContain("sunrise");
  });
});

describe("daily summary", () => {
  it("is due from 08:00 to noon business time", () => {
    expect(summaryDay(new Date("2026-11-03T02:29:00Z"), "Asia/Kolkata")).toBeNull(); // 07:59
    expect(summaryDay(new Date("2026-11-03T02:30:00Z"), "Asia/Kolkata")).toBe("2026-11-03");
    expect(summaryDay(new Date("2026-11-03T06:29:00Z"), "Asia/Kolkata")).toBe("2026-11-03"); // 11:59
    expect(summaryDay(new Date("2026-11-03T06:30:00Z"), "Asia/Kolkata")).toBeNull(); // noon
    expect(summaryDay(NOW, "America/New_York")).toBeNull(); // 22:00 the day before
  });
  it("opt-in only, once a day, to the alert address, with yesterday's numbers and today's list", async () => {
    expect(await enqueueDailySummaries(NOW)).toBe(0);
    fake.state.businesses.b1 = biz({ notificationPrefs: { dailySummary: true } });
    expect(await enqueueDailySummaries(NOW)).toBe(1);
    expect(await enqueueDailySummaries(new Date(NOW.getTime() + 3_600_000))).toBe(0);
    const row = fake.state.rows[0];
    expect(row).toMatchObject({ event: "summary.daily", recipient: "desk@sunrise.test", idempotencyKey: "summary.daily:b1:2026-11-03:desk@sunrise.test:EMAIL" });
    expect(row.payload).toMatchObject({ counts: { bookings: 3, completed: 2, cancelled: 1, noShows: 0 }, paidTotal: 1200, upcoming: [{ time: "2:00 PM", clientName: "Riya Kapoor", serviceName: "Checkup" }] });
    expect(row.expiresAt.toISOString()).toBe("2026-11-03T18:30:00.000Z"); // midnight in Kolkata
    const m = await renderTemplate(row.template, row.payload);
    expect(m.text).toContain("Yesterday:");
  });
});

describe("/api/settings/notifications", () => {
  const put = async (body: unknown) => {
    const { PUT } = await import("@/app/api/settings/notifications/route");
    return PUT(new NextRequest("http://localhost/api/settings/notifications", { method: "PUT", body: JSON.stringify(body) }));
  };
  it("needs a business session", async () => {
    session.mockResolvedValue(null);
    expect((await put(fullPrefs())).status).toBe(401);
    expect(fake.business.update).not.toHaveBeenCalled();
  });
  it("rejects bad input and saves nothing", async () => {
    const res = await put(fullPrefs({ reminderLeadMinutes: [120, 120] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("different times");
  });
  it("saves to the session's own business, longest reminder first, and returns the settings", async () => {
    fake.business.update.mockClear();
    const res = await put(fullPrefs({ reminderLeadMinutes: [120, 1440], dailySummary: true }));
    expect(res.status).toBe(200);
    expect(fake.business.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { notificationPrefs: expect.objectContaining({ reminderLeadMinutes: [1440, 120], dailySummary: true }) } });
    expect(await res.json()).toMatchObject({ alertEmail: "desk@sunrise.test", hasReviewLink: true, emailReminders: true, prefs: { reminderLeadMinutes: [1440, 120] } });
  });
});
