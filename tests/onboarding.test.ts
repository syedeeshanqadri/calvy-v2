import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// Step 9: the onboarding wizard. Slug rules, per-step validation, resume, and the "business is live" email once.

const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/createBusiness", () => ({ createBusinessForUser: vi.fn() }));

import { validateSlug } from "@/lib/slugs";
import { clampStep, currencyFor, detectRegion, HOURS_PRESETS, resumeStep, stepSchemas, SKIPPABLE, STEPS } from "@/lib/onboarding";
import { checkSlug, completeOnboarding, loadWizardState, saveStep, SlugTakenError } from "@/lib/onboardingDb";

beforeEach(() => vi.clearAllMocks());

describe("slug validation", () => {
  it("accepts a clean slug and lowercases it", () => {
    expect(validateSlug("Glow-Salon")).toEqual({ ok: true, slug: "glow-salon" });
  });
  it.each([["ab"], ["-glow"], ["glow-"], ["gl--ow"], ["glow salon"], ["glow_salon"], ["a".repeat(41)]])("rejects %s", (s) => {
    expect(validateSlug(s).ok).toBe(false);
  });
  it.each([["admin"], ["api"], ["dashboard"], ["www"], ["onboarding"], ["login"], ["Signup"]])("blocks the reserved word %s", (s) => {
    const r = validateSlug(s);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/reserved/);
  });
  it("the basics step refuses a bad slug server-side", () => {
    const base = { name: "Glow", timezone: "Asia/Kolkata", slug: "admin" };
    expect(stepSchemas.basics.safeParse(base).success).toBe(false);
    expect(stepSchemas.basics.safeParse({ ...base, slug: "glow" }).success).toBe(true);
  });
});

describe("slug uniqueness", () => {
  it("a slug owned by another business is unavailable; your own current slug is fine", async () => {
    db.business.findUnique.mockResolvedValue({ id: "other" });
    expect((await checkSlug("glow", "me")).ok).toBe(false);
    db.business.findUnique.mockResolvedValue({ id: "me" });
    expect((await checkSlug("glow", "me")).ok).toBe(true);
    db.business.findUnique.mockResolvedValue(null);
    expect((await checkSlug("glow", "me")).ok).toBe(true);
  });
  it("is enforced by the database: a concurrent claim (P2002) becomes SlugTakenError", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" });
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ business: { findUniqueOrThrow: vi.fn(async () => ({ onboardingStep: 1, packId: "OTHER" })), update: vi.fn(async () => { throw p2002; }) } }));
    await expect(saveStep("b1", "basics", { name: "Glow", slug: "glow", timezone: "Asia/Kolkata" } as never)).rejects.toBeInstanceOf(SlugTakenError);
  });
});

describe("step helpers", () => {
  it("detects India from the timezone, everything else is International", () => {
    expect(detectRegion("Asia/Kolkata")).toBe("IN");
    expect(detectRegion("Europe/London", "en-GB")).toBe("INTL");
    expect(detectRegion("UTC", "en-IN")).toBe("IN");
    expect(currencyFor("IN")).toBe("INR");
    expect(currencyFor("INTL", "GB")).toBe("GBP");
    expect(currencyFor("INTL", "IN")).toBe("USD");
  });
  it("hours need at least one open day and a closing time after opening", () => {
    const closed = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, { enabled: false, start: "09:00", end: "18:00" }]));
    expect(stepSchemas.hours.safeParse({ hours: closed }).success).toBe(false);
    expect(stepSchemas.hours.safeParse({ hours: HOURS_PRESETS[0].hours }).success).toBe(true);
    const bad = { ...HOURS_PRESETS[0].hours, "1": { enabled: true, start: "18:00", end: "09:00" } };
    expect(stepSchemas.hours.safeParse({ hours: bad }).success).toBe(false);
  });
  it("name, basics, type, services and done cannot all be skipped: only the sensible ones can", () => {
    expect(SKIPPABLE.has("basics")).toBe(false);
    expect(SKIPPABLE.has("type")).toBe(false);
    expect(SKIPPABLE.has("hours")).toBe(true);
    expect(STEPS).toHaveLength(8);
  });
});

describe("wizard resume", () => {
  it("opens at the saved step, clamped to 1..8", () => {
    expect(resumeStep(5)).toBe(5);
    expect(resumeStep(0)).toBe(1);
    expect(resumeStep(99)).toBe(8);
    expect(clampStep("abc")).toBe(1);
  });
  it("loadWizardState returns the saved step and the saved values", async () => {
    db.business.findUniqueOrThrow.mockResolvedValue({
      onboardingStep: 5, onboardingCompletedAt: null, region: "IN", currency: "INR", packId: "SALON_SPA", name: "Glow", slug: "glow",
      timezone: "Asia/Kolkata", phone: null, address: null, bookingMode: "SLOT", intendedPlan: null, availabilityJson: "{}",
      services: [{ id: "s1", name: "Haircut", duration: 30, price: 500 }],
    });
    const s = await loadWizardState("b1");
    expect(s).toMatchObject({ step: 5, completed: false, region: "IN", packId: "SALON_SPA", slug: "glow", intendedPlan: "free" });
    expect(s.services).toEqual([{ id: "s1", name: "Haircut", duration: 30, price: 500 }]);
  });
});

describe("business-live email", () => {
  it("is queued once at completion, never again on a repeat or double click", async () => {
    db.business.findUniqueOrThrow.mockResolvedValue({ name: "Glow", slug: "glow", businessType: "salon", packId: "SALON_SPA" });
    db.business.update.mockResolvedValue({});
    const owner = { name: "Asha Rao", email: "asha@glow.test" };

    db.business.updateMany.mockResolvedValueOnce({ count: 1 });
    expect((await completeOnboarding("b1", owner)).firstTime).toBe(true);
    db.business.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await completeOnboarding("b1", owner)).firstTime).toBe(false);
    db.business.updateMany.mockResolvedValueOnce({ count: 0 });
    await completeOnboarding("b1", owner);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ event: "business.live", template: "business_live", recipient: "asha@glow.test", businessId: "b1" });
    // The claim only succeeds while onboardingCompletedAt is still null.
    expect(db.business.updateMany.mock.calls[0][0].where).toEqual({ id: "b1", onboardingCompletedAt: null });
  });
  it("the welcome email no longer carries the live email", async () => {
    const { ownerWelcome, ownerLive } = await import("@/lib/notifications/business");
    const info = { businessId: "b1", slug: "glow", businessName: "Glow", ownerName: "Asha", ownerEmail: "a@x.test" };
    expect(ownerWelcome(info).event).toBe("account.created");
    expect(ownerLive(info).event).toBe("business.live");
  });
});
