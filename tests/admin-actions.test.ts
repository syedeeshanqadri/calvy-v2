import { describe, it, expect, vi, beforeEach } from "vitest";

// Admin actions (each audited with its reason), plan override expiry, suspension, verified-customer limits, secret redaction,
// and the NextAuth session that carries a view-as.

const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    business: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    customer: { findUnique: vi.fn() },
    appointment: { count: vi.fn() },
    appSetting: { findMany: vi.fn(), upsert: vi.fn() },
    passwordResetToken: { create: vi.fn(), deleteMany: vi.fn() },
    adminAuditLog: { create: vi.fn(async () => ({ id: "audit1" })) },
    adminSession: { findUnique: vi.fn() },
  };
  d.$transaction = vi.fn(async (fn: (t: unknown) => unknown) => fn(d));
  return d;
});
const notify = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => {}));
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.values.has(n) ? { value: jar.values.get(n) } : undefined), delete: vi.fn(), set: vi.fn() }) }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }));
vi.mock("@/lib/createBusiness", () => ({ createBusinessForUser: vi.fn(async () => ({ id: "newbiz" })) }));

import { actionSchema, createBusinessByAdmin, runBusinessAction } from "@/lib/admin/actions";
import { expirePlanOverrides, overrideExpired } from "@/lib/planOverride";
import { redactSecrets, MASK } from "@/lib/admin/redact";
import { VERIFIED_DEFAULTS, checkVerifiedLimits, getVerifiedLimits, isVerifiedBooker, parseLimit, signVerifiedTicket } from "@/lib/verifiedLimits";
import { signCreditTicket } from "@/lib/creditDb";
import { suspended, suspendedResponse } from "@/lib/suspension";
import { activeViewAs } from "@/lib/admin/viewAs";
import { ADMIN_COOKIE, hashToken } from "@/lib/admin/constants";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { authOptions } from "@/lib/auth";

process.env.NEXTAUTH_SECRET = "test-secret";
const ME = { id: "a1", email: "admin@calvy.test" };
const REASON = "Support ticket 123 raised by the owner";
const biz = (over: Record<string, unknown> = {}) => ({ id: "b1", name: "Glow", slug: "glow", plan: "free", planStatus: "free", planOverridePlan: null, planOverrideFromPlan: null, planOverrideFromStatus: null, suspendedAt: null, owner: { id: "o1", name: "Asha", email: "asha@glow.test", password: null, emailVerified: null }, ...over });
const audits = () => db.adminAuditLog.create.mock.calls.map((c: any[]) => c[0].data);

beforeEach(() => { vi.clearAllMocks(); jar.values.clear(); db.business.findUnique.mockResolvedValue(biz()); db.adminAuditLog.create.mockResolvedValue({ id: "audit1" }); db.business.update.mockResolvedValue({}); });

describe("every admin action writes one audit row with its reason", () => {
  const run = (a: Record<string, unknown>) => runBusinessAction(ME, "b1", actionSchema.parse({ reason: REASON, ...a }));
  it.each([
    ["edit", { action: "edit", name: "Glow Studio" }, "business.edit"],
    ["suspend", { action: "suspend" }, "business.suspend"],
    ["plan_override", { action: "plan_override", plan: "professional" }, "business.plan_override"],
    ["resend_live_email", { action: "resend_live_email" }, "business.resend_live_email"],
    ["resend_setup_email", { action: "resend_setup_email" }, "business.resend_setup_email"],
    ["reset_onboarding", { action: "reset_onboarding" }, "business.reset_onboarding"],
  ])("%s", async (_n, input, action) => {
    const r = await run(input);
    expect(r.ok).toBe(true);
    expect(audits()).toEqual([expect.objectContaining({ action, businessId: "b1", reason: REASON, adminId: "a1", adminEmail: "admin@calvy.test" })]);
  });
  it("unsuspend and clearing an override audit too", async () => {
    db.business.findUnique.mockResolvedValue(biz({ suspendedAt: new Date() }));
    expect((await run({ action: "unsuspend" })).ok).toBe(true);
    db.business.findUnique.mockResolvedValue(biz({ plan: "professional", planOverridePlan: "professional", planOverrideFromPlan: "free", planOverrideFromStatus: "free" }));
    expect((await run({ action: "plan_override_clear" })).ok).toBe(true);
    expect(audits().map((a: any) => a.action)).toEqual(["business.unsuspend", "business.plan_override_clear"]);
  });
  it("creating a business is audited and emails the owner a verify-and-set-password link", async () => {
    db.user.findFirst.mockResolvedValue(null); db.user.create.mockResolvedValue({ id: "o2" });
    const r = await createBusinessByAdmin(ME, { reason: REASON, ownerName: "Ravi", ownerEmail: "Ravi@Clinic.test", businessName: "Care Clinic", packId: "CLINIC", country: "IN", phone: "+919876543210" });
    expect(r.ok).toBe(true);
    expect(audits()[0]).toMatchObject({ action: "business.create", businessId: "newbiz", reason: REASON });
    expect(notify.mock.calls[0][0]).toMatchObject({ template: "owner_account_setup", recipient: "ravi@clinic.test" });
    db.user.findFirst.mockResolvedValue({ id: "exists" });
    expect((await createBusinessByAdmin(ME, { reason: REASON, ownerName: "Ravi", ownerEmail: "ravi@clinic.test", businessName: "X", packId: "CLINIC", country: "IN" })).ok).toBe(false);
  });
  it("no reason, no action: the schema refuses a missing or short reason", () => {
    expect(actionSchema.safeParse({ action: "suspend" }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "suspend", reason: "too short" }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "suspend", reason: "short" }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "delete_business", reason: REASON }).success).toBe(false);
  });
  it("the change and its audit row commit in the same transaction", async () => {
    await run({ action: "suspend" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it("double actions are refused (already suspended, nothing to clear, owner already verified)", async () => {
    db.business.findUnique.mockResolvedValue(biz({ suspendedAt: new Date() }));
    expect((await run({ action: "suspend" }))).toMatchObject({ ok: false, status: 409 });
    db.business.findUnique.mockResolvedValue(biz());
    expect((await run({ action: "unsuspend" }))).toMatchObject({ ok: false, status: 409 });
    expect((await run({ action: "plan_override_clear" }))).toMatchObject({ ok: false, status: 409 });
    db.business.findUnique.mockResolvedValue(biz({ owner: { id: "o1", name: "A", email: "a@x.test", password: "hash", emailVerified: new Date() } }));
    expect((await run({ action: "resend_setup_email" }))).toMatchObject({ ok: false, status: 409 });
    expect(audits()).toEqual([]);
  });
});

describe("plan override", () => {
  const run = (a: Record<string, unknown>) => runBusinessAction(ME, "b1", actionSchema.parse({ reason: REASON, ...a }), new Date("2026-11-10T10:00:00Z"));
  it("sets the plan until the end of the chosen day and remembers the original", async () => {
    const r = await run({ action: "plan_override", plan: "business", until: "2026-12-31" });
    expect(r.ok).toBe(true);
    expect(db.business.update.mock.calls[0][0].data).toMatchObject({ plan: "business", planStatus: "active", planOverridePlan: "business", planOverrideFromPlan: "free", planOverrideFromStatus: "free" });
    expect(db.business.update.mock.calls[0][0].data.planOverrideUntil.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
  it("an end date in the past is refused; a second override keeps the ORIGINAL plan to go back to", async () => {
    expect((await run({ action: "plan_override", plan: "business", until: "2026-11-01" }))).toMatchObject({ ok: false, status: 400 });
    db.business.findUnique.mockResolvedValue(biz({ plan: "professional", planStatus: "active", planOverridePlan: "professional", planOverrideFromPlan: "free", planOverrideFromStatus: "free" }));
    await run({ action: "plan_override", plan: "business" });
    expect(db.business.update.mock.calls[0][0].data).toMatchObject({ planOverrideFromPlan: "free", planOverrideUntil: null });
  });
  it("at the end date the original plan comes back (cron), and an override with no end date never lapses by itself", async () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(overrideExpired({ planOverridePlan: "business", planOverrideUntil: new Date("2026-12-31T23:59:59Z") }, now)).toBe(true);
    expect(overrideExpired({ planOverridePlan: "business", planOverrideUntil: new Date("2027-02-01T00:00:00Z") }, now)).toBe(false);
    expect(overrideExpired({ planOverridePlan: "business", planOverrideUntil: null }, now)).toBe(false);
    db.business.findMany.mockResolvedValue([{ id: "b1", planOverrideFromPlan: "free", planOverrideFromStatus: "free" }]);
    db.business.updateMany.mockResolvedValue({ count: 1 });
    expect(await expirePlanOverrides(db as never, now)).toBe(1);
    expect(db.business.updateMany.mock.calls[0][0].data).toMatchObject({ plan: "free", planStatus: "free", planOverridePlan: null, planOverrideUntil: null });
    expect(db.business.findMany.mock.calls[0][0].where).toMatchObject({ planOverridePlan: { not: null }, planOverrideUntil: { lte: now } });
  });
  it("resolving a business's features undoes a lapsed override too (the cron is not the only safety)", async () => {
    db.business.findUnique
      .mockResolvedValueOnce({ plan: "business", planOverridePlan: "business", planOverrideUntil: new Date(Date.now() - 60_000) })
      .mockResolvedValueOnce({ plan: "free", planOverridePlan: null, planOverrideUntil: null });
    db.business.findMany.mockResolvedValue([{ id: "b1", planOverrideFromPlan: "free", planOverrideFromStatus: "free" }]);
    db.business.updateMany.mockResolvedValue({ count: 1 });
    await getBusinessFeatures("b1").catch(() => {}); // plan limits come from PlanConfig (not mocked); only the revert matters here
    expect(db.business.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("suspension", () => {
  it("a suspended business is recognised and answers 503 BUSINESS_SUSPENDED", async () => {
    expect(suspended({ suspendedAt: new Date() })).toBe(true);
    expect(suspended({ suspendedAt: null })).toBe(false);
    const res = suspendedResponse("Glow");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("BUSINESS_SUSPENDED");
  });
  it("the routes that create bookings and offer times check it (static check)", async () => {
    const { readFileSync } = await import("fs");
    for (const f of ["app/api/bookings/route.ts", "app/api/appointments/route.ts", "app/api/availability/route.ts", "app/api/token-availability/route.ts"]) expect(readFileSync(f, "utf8")).toContain("suspendedResponse");
    for (const f of ["app/[slug]/page.tsx", "app/b/[slug]/page.tsx", "app/[slug]/book-now/page.tsx"]) expect(readFileSync(f, "utf8")).toContain("<Unavailable");
  });
  it("it blocks NEW bookings only: reschedule, cancel, reminders and customer emails are untouched (nothing about suspension is emailed)", async () => {
    const { readFileSync } = await import("fs");
    expect(readFileSync("lib/admin/actions.ts", "utf8")).not.toMatch(/suspend[\s\S]{0,400}notify\(/);
    for (const f of ["lib/notifications/reminders.ts", "lib/customerAppointments.ts"]) expect(readFileSync(f, "utf8")).not.toContain("suspended");
  });
});

describe("verified-customer booking limits (admin-set)", () => {
  const limits = { maxUpcomingPerBusiness: 6, maxNewPer24h: 5 };
  const check = (over: Partial<typeof limits> = {}) => checkVerifiedLimits(db as never, { businessId: "b1", businessName: "Care Clinic", email: "riya@mail.test", limits: { ...limits, ...over } });

  it("defaults are 6 upcoming per business and 5 new in 24 hours; stored values override; junk falls back", async () => {
    expect(VERIFIED_DEFAULTS).toEqual({ maxUpcomingPerBusiness: 6, maxNewPer24h: 5 });
    db.appSetting.findMany.mockResolvedValue([]);
    expect(await getVerifiedLimits(db as never)).toEqual(limits);
    db.appSetting.findMany.mockResolvedValue([{ key: "verified.maxUpcomingPerBusiness", value: "10" }, { key: "verified.maxNewPer24h", value: "0" }]);
    expect(await getVerifiedLimits(db as never)).toEqual({ maxUpcomingPerBusiness: 10, maxNewPer24h: 0 });
    expect(parseLimit("abc", 6)).toBe(6); expect(parseLimit("-1", 6)).toBe(6); expect(parseLimit("101", 6)).toBe(6); expect(parseLimit("2.5", 6)).toBe(6);
  });
  it("the 7th upcoming booking is refused (409), the 6th is allowed", async () => {
    db.appointment.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    expect((await check()).ok).toBe(true);
    db.appointment.count.mockReset(); db.appointment.count.mockResolvedValueOnce(6);
    expect(await check()).toMatchObject({ ok: false, code: "VERIFIED_UPCOMING_LIMIT", status: 409 });
  });
  it("the 6th booking in 24 hours is refused (429), the 5th is allowed", async () => {
    db.appointment.count.mockReset(); db.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(4);
    expect((await check()).ok).toBe(true);
    db.appointment.count.mockReset(); db.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    expect(await check()).toMatchObject({ ok: false, code: "VERIFIED_DAILY_LIMIT", status: 429 });
  });
  it("0 means no limit", async () => {
    db.appointment.count.mockReset(); db.appointment.count.mockResolvedValue(99);
    expect((await check({ maxUpcomingPerBusiness: 0, maxNewPer24h: 0 })).ok).toBe(true);
    expect(db.appointment.count).not.toHaveBeenCalled();
  });
  it("only a verified customer's own ticket and email count; a guest typing an email is a guest", async () => {
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: new Date() });
    expect(await isVerifiedBooker(db as never, [signVerifiedTicket("c1")], "Riya@Mail.test")).toBe(true);
    expect(await isVerifiedBooker(db as never, [signCreditTicket("c1", "b1")], "riya@mail.test")).toBe(true); // a credit link proves it too
    expect(await isVerifiedBooker(db as never, [signVerifiedTicket("c1")], "someone@else.test")).toBe(false);   // not their email
    expect(await isVerifiedBooker(db as never, [], "riya@mail.test")).toBe(false);                             // no ticket = guest
    expect(await isVerifiedBooker(db as never, ["forged.ticket.value"], "riya@mail.test")).toBe(false);
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: null });
    expect(await isVerifiedBooker(db as never, [signVerifiedTicket("c1")], "riya@mail.test")).toBe(false);     // unverified account
  });
});

describe("secrets never reach an admin screen", () => {
  it("bank, PAN and gateway account details are masked; empty ones stay empty", () => {
    const r = redactSecrets({ name: "Glow", bankAccountNumber: "123456789", bankIban: "", panNumber: "ABCDE1234F", razorpayConnectAccountId: "acc_1", gstNumber: "27AAA", phone: "+91" });
    expect(r).toMatchObject({ name: "Glow", phone: "+91", bankAccountNumber: MASK, panNumber: MASK, razorpayConnectAccountId: MASK, gstNumber: MASK, bankIban: "" });
    expect(JSON.stringify(r)).not.toContain("123456789");
    expect(JSON.stringify(r)).not.toContain("ABCDE1234F");
  });
});

describe("the session that carries a view-as", () => {
  const sess = (over: Record<string, unknown> = {}) => ({ id: "s1", userId: "a1", tokenHash: hashToken("tok"), lastSeenAt: new Date(), endedAt: null, viewAsBusinessId: "b1", viewAsMode: "READ", viewAsExpiresAt: new Date(Date.now() + 600_000), ...over });
  beforeEach(() => { jar.values.set(ADMIN_COOKIE, "tok"); db.user.findUnique.mockResolvedValue({ isSuperAdmin: true }); db.business.findUnique.mockResolvedValue({ id: "b1", slug: "glow", name: "Glow" }); });
  it("gives the viewed business to a live admin session", async () => {
    db.adminSession.findUnique.mockResolvedValue(sess());
    expect(await activeViewAs("a1")).toMatchObject({ businessId: "b1", slug: "glow", name: "Glow", mode: "READ" });
  });
  it("gives nothing when expired, ended, idle, someone else's, no cookie, or the user is no longer a super admin", async () => {
    db.adminSession.findUnique.mockResolvedValue(sess({ viewAsExpiresAt: new Date(Date.now() - 1000) })); expect(await activeViewAs("a1")).toBeNull();
    db.adminSession.findUnique.mockResolvedValue(sess({ endedAt: new Date() })); expect(await activeViewAs("a1")).toBeNull();
    db.adminSession.findUnique.mockResolvedValue(sess({ lastSeenAt: new Date(Date.now() - 31 * 60_000) })); expect(await activeViewAs("a1")).toBeNull();
    db.adminSession.findUnique.mockResolvedValue(sess({ userId: "other" })); expect(await activeViewAs("a1")).toBeNull();
    db.adminSession.findUnique.mockResolvedValue(sess()); db.user.findUnique.mockResolvedValue({ isSuperAdmin: false }); expect(await activeViewAs("a1")).toBeNull();
    db.user.findUnique.mockResolvedValue({ isSuperAdmin: true }); jar.values.clear(); expect(await activeViewAs("a1")).toBeNull();
  });
});

describe("NextAuth session during a view-as", () => {
  const sessionCb = authOptions.callbacks!.session!;
  const run = (token: Record<string, unknown>) => sessionCb({ session: { user: { id: "a1", email: "admin@calvy.test" }, expires: "" }, token } as never) as unknown as Promise<{ user: { businessId?: string; businessName?: string; role?: string; viewAs?: { mode: string } } }>;
  beforeEach(() => { jar.values.set(ADMIN_COOKIE, "tok"); db.user.findUnique.mockResolvedValue({ isSuperAdmin: true }); db.business.findUnique.mockResolvedValue({ id: "b1", slug: "glow", name: "Glow" }); });
  it("an admin in a live view-as appears as the viewed business's owner (so every page just works), flagged viewAs", async () => {
    db.adminSession.findUnique.mockResolvedValue({ id: "s1", userId: "a1", tokenHash: hashToken("tok"), lastSeenAt: new Date(), endedAt: null, viewAsBusinessId: "b1", viewAsMode: "ACT", viewAsExpiresAt: new Date(Date.now() + 600_000) });
    const s = await run({ uid: "a1", sa: true });
    expect(s.user).toMatchObject({ businessId: "b1", businessName: "Glow", role: "user", viewAs: { mode: "ACT" } });
  });
  it("everyone else, and an admin whose view-as ended, keeps their own claims", async () => {
    const own = await run({ uid: "a1" }); // not flagged as an admin at sign-in: no lookup at all
    expect(own.user.businessId).toBeUndefined();
    expect(db.adminSession.findUnique).not.toHaveBeenCalled();
    db.adminSession.findUnique.mockResolvedValue({ id: "s1", userId: "a1", tokenHash: hashToken("tok"), lastSeenAt: new Date(), endedAt: null, viewAsBusinessId: "b1", viewAsMode: "READ", viewAsExpiresAt: new Date(Date.now() - 1000) });
    const ended = await run({ uid: "a1", sa: true });
    expect(ended.user.businessId).toBeUndefined();
    expect(ended.user.viewAs).toBeUndefined();
  });
});
