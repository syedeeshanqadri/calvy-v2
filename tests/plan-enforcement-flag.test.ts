import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// PLAN_ENFORCEMENT: ON is today's behaviour; OFF treats every business as having every feature and
// no limits, through the single helper in lib/plans.ts that every gate reads.

const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  planConfig: { findUnique: vi.fn() },
  staff: { count: vi.fn() },
  service: { count: vi.fn() },
  appointment: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { isPlanEnforcementOn } from "@/lib/flags";
import {
  PLAN_LIMITS, applyEnforcement, configFromLimits, getLimits, getLimitsFromDB, isActivePlan, planSeed, unlimitedLimits,
} from "@/lib/plans";
import { checkLimit } from "@/lib/limits";
import { getEffectiveLimits } from "@/lib/getFeatures";

const setMode = (v: string) => vi.stubEnv("PLAN_ENFORCEMENT", v);

beforeEach(() => {
  vi.clearAllMocks();
  db.planConfig.findUnique.mockResolvedValue(null); // fall back to the code defaults
  db.staff.count.mockResolvedValue(99);
  db.service.count.mockResolvedValue(99);
  db.appointment.count.mockResolvedValue(9999);
});
afterEach(() => vi.unstubAllEnvs());

describe("the flag itself", () => {
  it("is off unless the variable is 1 or true, in every environment", () => {
    expect(isPlanEnforcementOn({})).toBe(false);
    expect(isPlanEnforcementOn({ PLAN_ENFORCEMENT: "" })).toBe(false);
    expect(isPlanEnforcementOn({ PLAN_ENFORCEMENT: "0" })).toBe(false);
    expect(isPlanEnforcementOn({ PLAN_ENFORCEMENT: "on" })).toBe(false);
    for (const v of ["1", "true", " TRUE "]) expect(isPlanEnforcementOn({ PLAN_ENFORCEMENT: v })).toBe(true);
  });
});

describe("Free plan keeps email, not WhatsApp", () => {
  it("the defaults and the seed give Free email reminders but no WhatsApp reminders", () => {
    expect(PLAN_LIMITS.free.emailReminders).toBe(true);
    expect(PLAN_LIMITS.free.whatsappReminders).toBe(false);
    expect(planSeed("free")).toMatchObject({ emailReminders: true, smsReminders: false });
    expect(configFromLimits(PLAN_LIMITS.free).emailReminders).toBe(true);
  });
});

describe("enforcement ON: today's behaviour", () => {
  beforeEach(() => setMode("1"));

  it("limits are the plan's own", () => {
    expect(getLimits("free")).toEqual(PLAN_LIMITS.free);
    expect(getLimits("free").maxStaff).toBe(1);
    expect(getLimits("free").whatsappReminders).toBe(false);
  });
  it("the database row decides, and an expired paid plan is not active", async () => {
    db.planConfig.findUnique.mockResolvedValue({ ...configFromLimits({ ...PLAN_LIMITS.free, maxStaff: 7 }) });
    expect((await getLimitsFromDB("free")).maxStaff).toBe(7);
    expect(isActivePlan("past_due", "professional", null)).toBe(false);
    expect(isActivePlan("active", "professional", null)).toBe(true);
  });
  it("a lapsed paid plan falls back to Free limits for public bookings", async () => {
    const limits = await getEffectiveLimits({ plan: "business", planStatus: "past_due" });
    expect(limits).toEqual(PLAN_LIMITS.free);
  });
  it("API checks refuse what the plan lacks or has used up", async () => {
    db.business.findUnique.mockResolvedValue({ plan: "free", planStatus: "free", trialEndsAt: null, timezone: "Asia/Kolkata" });
    expect((await checkLimit("b1", "staff"))?.code).toBe("LIMIT_REACHED");
    expect((await checkLimit("b1", "services"))?.code).toBe("LIMIT_REACHED");
    expect((await checkLimit("b1", "monthlyAppointments"))?.code).toBe("LIMIT_REACHED");
    expect((await checkLimit("b1", "csv"))?.code).toBe("FEATURE_LOCKED");
    expect((await checkLimit("b1", "upload"))?.code).toBe("FEATURE_LOCKED");
    expect((await checkLimit("b1", "slotInterval"))?.code).toBe("FEATURE_LOCKED");
    expect((await checkLimit("b1", "group", { capacity: 4 }))?.code).toBe("FEATURE_LOCKED");
  });
  it("an owner of a lapsed paid plan is refused outright", async () => {
    db.business.findUnique.mockResolvedValue({ plan: "professional", planStatus: "past_due", trialEndsAt: null, timezone: "Asia/Kolkata" });
    expect((await checkLimit("b1", "staff", { owner: true }))?.code).toBe("PLAN_EXPIRED");
  });
});

describe("enforcement OFF: nothing is blocked", () => {
  beforeEach(() => setMode(""));

  it("every limit is unlimited and every feature is on, whatever the plan", () => {
    for (const plan of ["free", "starter", "professional", "business"] as const) {
      const l = getLimits(plan);
      for (const [k, v] of Object.entries(l)) {
        if (k === "platformFeeMinorIN") continue;
        expect(v, `${plan}.${k}`).toBe(typeof PLAN_LIMITS[plan][k as keyof typeof l] === "number" ? -1 : true);
      }
    }
  });
  it("Calvy's own online-booking fee is not a gate and is kept", async () => {
    expect(getLimits("free").platformFeeMinorIN).toBe(PLAN_LIMITS.free.platformFeeMinorIN);
    db.planConfig.findUnique.mockResolvedValue({ ...configFromLimits(PLAN_LIMITS.free) });
    expect((await getLimitsFromDB("free")).platformFeeMinorIN).toBe(1000);
  });
  it("an expired plan counts as active", () => {
    expect(isActivePlan("past_due", "professional", null)).toBe(true);
    expect(isActivePlan("cancelled", "business", null)).toBe(true);
  });
  it("a lapsed paid plan keeps everything for public bookings too", async () => {
    const limits = await getEffectiveLimits({ plan: "business", planStatus: "past_due" });
    expect(limits.whatsappReminders).toBe(true);
    expect(limits.maxMonthlyAppointments).toBe(-1);
  });
  it("API checks block nothing, even for a Free business over every cap", async () => {
    db.business.findUnique.mockResolvedValue({ plan: "free", planStatus: "free", trialEndsAt: null, timezone: "Asia/Kolkata" });
    for (const kind of ["staff", "services", "monthlyAppointments", "csv", "upload", "slotInterval", "expenses"] as const) {
      expect(await checkLimit("b1", kind), kind).toBeNull();
    }
    expect(await checkLimit("b1", "group", { capacity: 4 })).toBeNull();
  });
  it("owner checks do not fail on an expired plan", async () => {
    db.business.findUnique.mockResolvedValue({ plan: "professional", planStatus: "past_due", trialEndsAt: null, timezone: "Asia/Kolkata" });
    expect(await checkLimit("b1", "staff", { owner: true })).toBeNull();
  });
  it("the enforcement code is intact: the same call enforces again when told so", () => {
    expect(applyEnforcement(PLAN_LIMITS.free, true)).toEqual(PLAN_LIMITS.free);
    expect(applyEnforcement(PLAN_LIMITS.free, false)).toEqual(unlimitedLimits(PLAN_LIMITS.free));
  });
});
