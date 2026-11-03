import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { isPlaceId, buildReviewLink, reviewLinkFromInput } from "@/lib/brandLinks";
import { clampReviewDelay, resolvePrefs, prefsInputSchema, skipReasons } from "@/lib/notifications/prefs";
import { reviewRequest, reviewRequestFor } from "@/lib/notifications/business";
import { recentlyAskedForReview, reviewSendBlocker, REVIEW_THROTTLE_DAYS } from "@/lib/notifications/reviewThrottle";
import { websiteConfigSchema } from "@/lib/validation/misc";

const PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const DAY = 24 * 3_600_000;
const now = new Date("2026-11-10T10:00:00Z");

describe("review link builder", () => {
  it("recognises Place IDs", () => {
    expect(isPlaceId(PLACE)).toBe(true);
    expect(isPlaceId(`  ${PLACE} `)).toBe(true);
    for (const bad of ["", "hello", "ChIJ", "ChIJ short", "https://g.page/r/abc/review", "<script>"]) expect(isPlaceId(bad)).toBe(false);
  });
  it("builds the write-a-review URL from a Place ID", () => {
    expect(buildReviewLink(PLACE)).toBe(`https://search.google.com/local/writereview?placeid=${PLACE}`);
    expect(reviewLinkFromInput(PLACE)).toEqual({ ok: true, value: `https://search.google.com/local/writereview?placeid=${PLACE}` });
  });
  it("accepts a full Google review URL and rejects everything else", () => {
    expect(reviewLinkFromInput("https://g.page/r/CabC123/review").ok).toBe(true);
    for (const bad of ["https://evil.test/review", "javascript:alert(1)", "not a link", ""]) {
      expect(reviewLinkFromInput(bad).ok, bad).toBe(false);
    }
  });
});

describe("review delay", () => {
  it("defaults to 2 hours and clamps to 1-48", () => {
    expect(clampReviewDelay(undefined)).toBe(2);
    expect(clampReviewDelay("5")).toBe(2);
    expect(clampReviewDelay(NaN)).toBe(2);
    expect(clampReviewDelay(0)).toBe(1);
    expect(clampReviewDelay(100)).toBe(48);
    expect(clampReviewDelay(6.4)).toBe(6);
    expect(resolvePrefs(null).customer.reviewDelayHours).toBe(2);
    expect(resolvePrefs({ customer: { reviewDelayHours: 72 } }).customer.reviewDelayHours).toBe(48);
  });
  it("the settings API schema rejects out-of-range hours", () => {
    const base = resolvePrefs(null);
    expect(prefsInputSchema.safeParse({ ...base, customer: { ...base.customer, reviewDelayHours: 24 } }).success).toBe(true);
    expect(prefsInputSchema.safeParse({ ...base, customer: { ...base.customer, reviewDelayHours: 0 } }).success).toBe(false);
    expect(prefsInputSchema.safeParse({ ...base, customer: { ...base.customer, reviewDelayHours: 49 } }).success).toBe(false);
  });
  it("the request is queued after the owner's delay", () => {
    const n = { appointmentId: "a1", businessId: "b1", to: "c@x.test", payload: { clientName: "Cy", businessName: "Biz" } } as never;
    const r = reviewRequest(n, "https://g.page/r/abc/review", now, 6)!;
    expect(r.notBefore!.getTime() - now.getTime()).toBe(6 * 3_600_000);
  });
});

type Row = { id: string; businessId: string; event: string; channel: string; recipient: string; appointmentId: string; status: string; createdAt: Date };
/** Just enough of notificationOutbox.findFirst for the two throttle queries. */
function fakeDb(rows: Row[]) {
  const match = (r: Row, w: any): boolean =>
    (w.id?.not === undefined || r.id !== w.id.not) &&
    (w.appointmentId?.not === undefined || r.appointmentId !== w.appointmentId.not) &&
    r.businessId === w.businessId && r.event === w.event && r.channel === w.channel && r.recipient === w.recipient &&
    r.createdAt >= w.createdAt.gte &&
    (w.status ? w.status.in.includes(r.status) : true) &&
    (w.OR ? w.OR.some((o: any) => (o.status === "SENT" ? r.status === "SENT" : o.status.in.includes(r.status) && r.createdAt < o.createdAt.lt)) : true);
  return { notificationOutbox: { findFirst: vi.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null) } } as never;
}
const row = (over: Partial<Row>): Row => ({ id: "r0", businessId: "b1", event: "booking.review_request", channel: "EMAIL", recipient: "c@x.test", appointmentId: "a0", status: "SENT", createdAt: new Date(now.getTime() - 5 * DAY), ...over });

describe("30-day throttle", () => {
  it("is 30 days", () => expect(REVIEW_THROTTLE_DAYS).toBe(30));
  it("blocks a second request inside 30 days, for any status that counts", async () => {
    for (const status of ["SENT", "PENDING", "SENDING"]) {
      expect(await recentlyAskedForReview(fakeDb([row({ status })]), { businessId: "b1", recipient: "C@X.test", appointmentId: "a1", now }), status).toBe(true);
    }
  });
  it("allows it after 30 days, for another business, another customer, or when the earlier one failed/skipped", async () => {
    const o = { businessId: "b1", recipient: "c@x.test", appointmentId: "a1", now };
    expect(await recentlyAskedForReview(fakeDb([row({ createdAt: new Date(now.getTime() - 31 * DAY) })]), o)).toBe(false);
    expect(await recentlyAskedForReview(fakeDb([row({ businessId: "b2" })]), o)).toBe(false);
    expect(await recentlyAskedForReview(fakeDb([row({ recipient: "other@x.test" })]), o)).toBe(false);
    expect(await recentlyAskedForReview(fakeDb([row({ status: "SKIPPED" })]), o)).toBe(false);
    expect(await recentlyAskedForReview(fakeDb([row({ status: "FAILED" })]), o)).toBe(false);
  });
  it("the same booking never throttles itself", async () => {
    expect(await recentlyAskedForReview(fakeDb([row({ appointmentId: "a1" })]), { businessId: "b1", recipient: "c@x.test", appointmentId: "a1", now })).toBe(false);
  });
  it("send time: a sent request wins, otherwise the earlier queued one wins", async () => {
    const me = { id: "me", businessId: "b1", recipient: "c@x.test", createdAt: new Date(now.getTime() - DAY) };
    expect(await reviewSendBlocker(fakeDb([row({ id: "x", status: "SENT" })]), me, now)).toMatch(/30 days/);
    expect(await reviewSendBlocker(fakeDb([row({ id: "x", status: "PENDING", createdAt: new Date(now.getTime() - 2 * DAY) })]), me, now)).toMatch(/30 days/);
    expect(await reviewSendBlocker(fakeDb([row({ id: "x", status: "PENDING", createdAt: new Date(now.getTime() - 0.5 * DAY) })]), me, now)).toBeNull();
    expect(await reviewSendBlocker(fakeDb([]), me, now)).toBeNull();
  });
});

describe("queueing rules", () => {
  const n = { appointmentId: "a1", businessId: "b1", to: "c@x.test", payload: { clientName: "Cy", businessName: "Biz" } } as never;
  it("no review link means no request", async () => {
    expect(await reviewRequestFor(n, { googleReviewUrl: null, notificationPrefs: null }, now)).toBeNull();
    expect(await reviewRequestFor(n, { googleReviewUrl: "https://evil.test/x", notificationPrefs: null }, now)).toBeNull();
  });
  it("no email address means no request", async () => {
    expect(reviewRequest({ ...(n as object), to: null } as never, "https://g.page/r/abc/review")).toBeNull();
  });
  it("sends the same link to everyone: the payload carries the link and no rating fields", () => {
    const r = reviewRequest(n, "https://g.page/r/abc/review", now)!;
    expect(Object.keys(r.payload as object).sort()).toEqual(["businessName", "clientName", "reviewUrl"]);
  });
});

describe("unsubscribe and business switch skip the request", () => {
  const cand = [{ businessId: "b1", event: "booking.review_request", recipient: "c@x.test" }];
  it("skips an unsubscribed customer", async () => {
    const db = {
      business: { findMany: vi.fn(async () => [{ id: "b1", notificationPrefs: null }]) },
      notificationOptOut: { findMany: vi.fn(async () => [{ businessId: "b1", recipient: "c@x.test" }]) },
    } as never;
    expect((await skipReasons(db, cand)).get(0)).toBe("unsubscribed");
  });
  it("skips when the business switched review requests off", async () => {
    const db = {
      business: { findMany: vi.fn(async () => [{ id: "b1", notificationPrefs: { customer: { reviewRequest: false } } }]) },
      notificationOptOut: { findMany: vi.fn(async () => []) },
    } as never;
    expect((await skipReasons(db, cand)).get(0)).toBe("turned off by the business");
  });
});

describe("website review toggle", () => {
  it("is accepted by the config schema", () => {
    expect(websiteConfigSchema.safeParse({ reviews: { enabled: false } }).success).toBe(true);
    expect(websiteConfigSchema.safeParse({ reviews: { enabled: "no" } }).success).toBe(false);
  });
});
