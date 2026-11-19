import { describe, it, expect, vi, beforeEach } from "vitest";

// Abandoned onboarding: the lead, the four reminders (+1h, +24h, +3d, +7d after the last activity), and what stops them.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notifications/secret", () => ({ sign: (p: string, v: string) => `sig-${p}-${v}`, verifySignature: (p: string, v: string, s: string) => s === `sig-${p}-${v}` }));

import { dueReminder, REMINDER_DELAYS_MS, MAX_REMINDERS, touchSignupLead, convertSignupLead, upsertSignupLead } from "@/lib/leads";
import { queueOnboardingReminders, reminderStillWanted, recordReminderSent, isValidLeadUnsubscribe, leadUnsubscribeLinks } from "@/lib/onboardingReminders";
import { onboardingReminderSubject } from "@/emails/templates";

const T0 = new Date("2026-11-20T10:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);
const H = 3_600_000, D = 24 * H;
const lead = (over = {}) => ({ remindersSent: 0, lastActivityAt: T0, convertedAt: null, unsubscribedAt: null, ...over });

describe("the reminder schedule", () => {
  it("is +1h, +24h, +3d, +7d from the last activity, in order", () => {
    expect(REMINDER_DELAYS_MS).toEqual([1 * H, 24 * H, 3 * D, 7 * D]);
    expect(MAX_REMINDERS).toBe(4);
    expect(dueReminder(lead(), after(59 * 60_000))).toBeNull();
    expect(dueReminder(lead(), after(1 * H))).toBe(1);
    expect(dueReminder(lead({ remindersSent: 1 }), after(23 * H))).toBeNull();
    expect(dueReminder(lead({ remindersSent: 1 }), after(24 * H))).toBe(2);
    expect(dueReminder(lead({ remindersSent: 2 }), after(3 * D))).toBe(3);
    expect(dueReminder(lead({ remindersSent: 3 }), after(7 * D))).toBe(4);
  });
  it("a long-lost lead gets only the next one in line, never a burst, and never a fifth", () => {
    expect(dueReminder(lead(), after(30 * D))).toBe(1);
    expect(dueReminder(lead({ remindersSent: 4 }), after(30 * D))).toBeNull();
  });
  it("stops on completion and on unsubscribe", () => {
    expect(dueReminder(lead({ convertedAt: T0 }), after(2 * D))).toBeNull();
    expect(dueReminder(lead({ unsubscribedAt: T0 }), after(2 * D))).toBeNull();
    expect(dueReminder(lead({ lastActivityAt: null }), after(2 * D))).toBeNull();
  });
  it("the wording is plain and the four subjects differ", () => {
    const subjects = [1, 2, 3, 4].map(onboardingReminderSubject);
    expect(new Set(subjects).size).toBe(4);
    for (const s of subjects) expect(s).not.toMatch(/!|free|offer|discount|limited|%|\$/i);
  });
});

function fakeDb(leads: Record<string, unknown>[], owner: Record<string, unknown> | null) {
  const updates: unknown[] = [];
  return {
    updates,
    lead: {
      findMany: vi.fn(async () => leads.map((l) => ({ ...l }))), // copies, like a real read
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; remindersSent: number }; data: object }) => {
        const l = leads.find((x) => x.id === where.id);
        if (!l || l.remindersSent !== where.remindersSent) return { count: 0 };
        Object.assign(l, data); updates.push(data); return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: object }) => { updates.push(data); return {}; }),
      findUnique: vi.fn(),
    },
    user: { findUnique: vi.fn(async () => owner) },
    ownerLoginToken: { create: vi.fn(), deleteMany: vi.fn() },
  };
}

describe("queueing reminders", () => {
  beforeEach(() => vi.clearAllMocks());
  const owner = { id: "u1", name: "Asha Rao", email: "asha@x.co", business: { onboardingCompletedAt: null, onboardingStep: 3 } };
  const row = () => ({ id: "l1", userId: "u1", source: "signup", remindersSent: 0, lastActivityAt: T0, convertedAt: null, unsubscribedAt: null });

  it("queues the due reminder with a resume link to the step reached, and counts it before queueing", async () => {
    const db = fakeDb([row()], owner);
    const r = await queueOnboardingReminders(db as never, after(2 * H));
    expect(r.queued).toBe(1);
    expect(db.ownerLoginToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u1", purpose: "resume", step: 3 }) });
    expect(notify.mock.calls[0][0]).toMatchObject({ template: "onboarding_reminder", recipient: "asha@x.co", payload: { n: 1, leadId: "l1" } });
    expect(String(notify.mock.calls[0][0].secret)).toContain("/auth/magic?token=");
    expect(db.updates[0]).toMatchObject({ remindersSent: 1 });
  });
  it("two runs cannot both send the same reminder (the count is claimed conditionally)", async () => {
    const shared = [row()];
    const a = fakeDb(shared, owner), b = fakeDb(shared, owner);
    const [ra, rb] = await Promise.all([queueOnboardingReminders(a as never, after(2 * H)), queueOnboardingReminders(b as never, after(2 * H))]);
    expect(ra.queued + rb.queued).toBe(1);
  });
  it("nothing is queued once onboarding is complete: the lead is closed as converted instead", async () => {
    const done = { ...owner, business: { onboardingCompletedAt: T0, onboardingStep: 7 } };
    const db = fakeDb([row()], done);
    const r = await queueOnboardingReminders(db as never, after(2 * D));
    expect(r).toEqual({ queued: 0, converted: 1 });
    expect(notify).not.toHaveBeenCalled();
    expect(db.updates[0]).toMatchObject({ status: "converted" });
  });
  it("nothing is queued before the first delay", async () => {
    const db = fakeDb([row()], owner);
    expect((await queueOnboardingReminders(db as never, after(30 * 60_000))).queued).toBe(0);
  });
  it("at send time a lead that converted or unsubscribed meanwhile is skipped", async () => {
    const db = fakeDb([], null);
    db.lead.findUnique.mockResolvedValueOnce({ convertedAt: T0, unsubscribedAt: null }).mockResolvedValueOnce({ convertedAt: null, unsubscribedAt: T0 }).mockResolvedValueOnce({ convertedAt: null, unsubscribedAt: null }).mockResolvedValueOnce(null);
    expect(await reminderStillWanted(db as never, "l1")).toBe("onboarding complete");
    expect(await reminderStillWanted(db as never, "l1")).toBe("unsubscribed");
    expect(await reminderStillWanted(db as never, "l1")).toBeNull();
    expect(await reminderStillWanted(db as never, "gone")).toBe("lead gone");
  });
  it("each real send is written on the lead, where the team reads it", async () => {
    const db = fakeDb([], null);
    db.lead.findUnique.mockResolvedValue({ notes: "Called once." });
    await recordReminderSent(db as never, "l1", 2, after(24 * H));
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { notes: expect.stringMatching(/^Called once\.\n\[auto\] Onboarding reminder 2 of 4 emailed 2026-11-21 10:00 UTC$/) } });
  });
  it("the stop link is signed for one lead and works as a one-click link", () => {
    const l = leadUnsubscribeLinks("l1");
    expect(l.page).toContain("/unsubscribe/onboarding?l=l1&s=");
    expect(l.oneClick).toContain("/api/unsubscribe/onboarding?l=l1&s=");
    const sig = new URL(l.page).searchParams.get("s") as string;
    expect(isValidLeadUnsubscribe("l1", sig)).toBe(true);
    expect(isValidLeadUnsubscribe("l2", sig)).toBe(false);
    expect(isValidLeadUnsubscribe("l1", "forged")).toBe(false);
  });
});

describe("the lead follows onboarding", () => {
  const user = { id: "u1", name: "Asha", email: "asha@x.co" };
  it("created at sign-up as source=signup at step 1; progress restarts the clock; completion converts it with the plan", async () => {
    const store: Record<string, unknown> = {};
    const db = {
      lead: {
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => { if (!store.id) Object.assign(store, { id: "l1", remindersSent: 2, convertedAt: null, ...create }); return store; }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(store, data)),
      },
    };
    await upsertSignupLead(db as never, user, { step: 1 }, T0);
    expect(store).toMatchObject({ source: "signup", onboardingStep: 1, status: "new", userId: "u1" });
    await touchSignupLead(db as never, user, 3, after(H));
    expect(store).toMatchObject({ onboardingStep: 3, remindersSent: 0, lastActivityAt: after(H) });
    await touchSignupLead(db as never, user, 2, after(2 * H)); // going back never lowers the step
    expect(store.onboardingStep).toBe(3);
    await convertSignupLead(db as never, user, "professional", after(3 * H));
    expect(store).toMatchObject({ status: "converted", plan: "professional", onboardingStep: 7 });
    const converted = store.convertedAt;
    await touchSignupLead(db as never, user, 4, after(4 * H)); // a converted lead stays converted
    expect(store.convertedAt).toBe(converted);
  });
});
