import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

// S5-06 / S5-07: one source of truth for plans, and every flag enforced in the API.

const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    business: { findUnique: vi.fn(), update: vi.fn() },
    supportTicket: { create: vi.fn(), findMany: vi.fn() },
    expense: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  return d;
});
const session = vi.hoisted(() => ({ current: null as unknown }));
const check = vi.hoisted(() => ({ checkLimit: vi.fn() }));
const features = vi.hoisted(() => ({ getBusinessFeatures: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/limits", async () => ({ ...(await vi.importActual<object>("@/lib/limits")), checkLimit: check.checkLimit }));
vi.mock("@/lib/getFeatures", () => ({ getBusinessFeatures: features.getBusinessFeatures }));

import {
  PLAN_LIMITS, configFromLimits, limitsFromConfig, planSeed, type PlanId, type PlanLimits,
} from "@/lib/plans";
import { evaluateLimit } from "@/lib/limits";
import { PATCH as settingsPatch } from "@/app/api/settings/route";
import { POST as supportPost } from "@/app/api/support/route";
import { GET as expensesGet } from "@/app/api/expenses/route";

const IDS: PlanId[] = ["free", "starter", "professional", "business"];
const columns = new Set(Object.values(Prisma.PlanConfigScalarFieldEnum) as string[]);

describe("one source of truth for plans", () => {
  it("every limit and flag in the code has a PlanConfig column (no field can drift out of the database)", () => {
    for (const id of IDS) {
      for (const key of Object.keys(configFromLimits(PLAN_LIMITS[id]))) expect(columns.has(key), `${id}.${key}`).toBe(true);
    }
  });
  it("seeding a plan from the defaults sets every column the plan screens read", () => {
    for (const id of IDS) {
      const seed = planSeed(id);
      for (const key of Object.keys(configFromLimits(PLAN_LIMITS[id]))) expect(seed, `${id}.${key}`).toHaveProperty(key);
      expect(seed.planId).toBe(id);
    }
  });
  it("a database row and the code limits convert to each other without losing anything", () => {
    for (const id of IDS) {
      const limits: PlanLimits = PLAN_LIMITS[id];
      expect(limitsFromConfig(configFromLimits(limits))).toEqual(limits);
    }
  });
  it("the WhatsApp reminder flag is the database's smsReminders column", () => {
    expect(limitsFromConfig({ ...configFromLimits(PLAN_LIMITS.free), smsReminders: true }).whatsappReminders).toBe(true);
    expect(configFromLimits(PLAN_LIMITS.business).smsReminders).toBe(PLAN_LIMITS.business.whatsappReminders);
  });
});

describe("limit decisions for the new kinds", () => {
  it("slot length and expenses are locked when the plan lacks the flag, open when it has it", () => {
    expect(evaluateLimit(PLAN_LIMITS.free, "slotInterval")?.code).toBe("FEATURE_LOCKED");
    expect(evaluateLimit(PLAN_LIMITS.starter, "slotInterval")).toBeNull();
    expect(evaluateLimit({ ...PLAN_LIMITS.free, expenseTracking: false }, "expenses")?.code).toBe("FEATURE_LOCKED");
    expect(evaluateLimit(PLAN_LIMITS.free, "expenses")).toBeNull();
  });
});

const patch = (body: unknown) =>
  new NextRequest("http://localhost/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("slot interval is enforced in the settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.current = { user: { id: "u1", businessId: "b1" } };
    db.business.findUnique.mockResolvedValue({ slotInterval: 30 });
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
    db.business.update.mockResolvedValue({ id: "b1" });
  });
  it("a plan without the flag cannot change the slot length", async () => {
    check.checkLimit.mockResolvedValue({ kind: "slotInterval", status: 402, code: "FEATURE_LOCKED", error: "no" });
    const res = await settingsPatch(patch({ slotInterval: 15 }));
    expect(res.status).toBe(402);
    expect(db.business.update).not.toHaveBeenCalled();
  });
  it("a plan with the flag can", async () => {
    check.checkLimit.mockResolvedValue(null);
    expect((await settingsPatch(patch({ slotInterval: 15 }))).status).toBe(200);
    expect(check.checkLimit).toHaveBeenCalledWith("b1", "slotInterval", { owner: true });
  });
  it("keeping the current length, or going back to the 30-minute default, is always allowed", async () => {
    db.business.findUnique.mockResolvedValue({ slotInterval: 15 });
    check.checkLimit.mockResolvedValue({ kind: "slotInterval", status: 402, code: "FEATURE_LOCKED", error: "no" });
    expect((await settingsPatch(patch({ slotInterval: 15 }))).status).toBe(200);
    expect((await settingsPatch(patch({ slotInterval: 30 }))).status).toBe(200);
    expect(check.checkLimit).not.toHaveBeenCalled();
  });
});

describe("support is open to every plan; priority is a speed, not access", () => {
  const post = () =>
    supportPost(new NextRequest("http://localhost/api/support", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject: "Help", body: "Something broke" }),
    }));
  beforeEach(() => {
    vi.clearAllMocks();
    session.current = { user: { id: "u1", businessId: "b1" } };
    db.supportTicket.create.mockResolvedValue({ id: "t1" });
  });
  it("a plan without priority support can still open a ticket, at its own priority", async () => {
    features.getBusinessFeatures.mockResolvedValue({ prioritySupport: false });
    expect((await post()).status).toBeLessThan(300);
    expect(db.supportTicket.create.mock.calls[0][0].data.priority).toBe("normal");
  });
  it("a plan with priority support has its tickets ranked at least high", async () => {
    features.getBusinessFeatures.mockResolvedValue({ prioritySupport: true });
    await post();
    expect(db.supportTicket.create.mock.calls[0][0].data.priority).toBe("high");
  });
});

describe("expenses are enforced in the API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.current = { user: { id: "u1", businessId: "b1" } };
    db.expense.findMany.mockResolvedValue([]);
  });
  it("a plan without expense tracking is refused and nothing is read", async () => {
    check.checkLimit.mockResolvedValue({ kind: "expenses", status: 402, code: "FEATURE_LOCKED", error: "no" });
    const res = await expensesGet(new NextRequest("http://localhost/api/expenses"));
    expect(res.status).toBe(402);
    expect(db.expense.findMany).not.toHaveBeenCalled();
  });
  it("a plan with it is served", async () => {
    check.checkLimit.mockResolvedValue(null);
    expect((await expensesGet(new NextRequest("http://localhost/api/expenses"))).status).toBe(200);
  });
});
