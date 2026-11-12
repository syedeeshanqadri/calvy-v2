import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// step-3/scheduler-reminders: reminders are queued when due (one or two leads), once per booking time + lead +
// channel, follow plan limits and unsubscribes, and are dropped at send when the booking was cancelled or moved.

const fake = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state = {
    rows: [] as Row[],
    appointments: [] as Row[],
    optouts: [] as { businessId: string; recipient: string }[],
    limits: { emailReminders: true, whatsappReminders: false },
    whatsappOn: false,
  };
  const f = {
    state,
    whatsAppConfig: { findUnique: async () => null, findMany: async () => (state.whatsappOn ? [{ businessId: "b1" }] : []) },
    appointment: {
      findMany: vi.fn(async (..._a: unknown[]) => state.appointments),
      findUnique: vi.fn(async ({ where }: any) => state.appointments.find((a) => a.id === where.id) ?? null),
    },
    business: {
      findMany: vi.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, notificationPrefs: null }))),
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
  };
  return f;
});
vi.mock("@/lib/prisma", () => ({ prisma: fake }));
vi.mock("@/lib/getFeatures", () => ({ getEffectiveLimits: vi.fn(async () => fake.state.limits) }));
const push = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => {}));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: push }));

import { REMINDER_EVENT, dueLeads, reminderAnchor, reminderSendCheck } from "@/lib/notifications/reminderRules";
import { resolvePrefs, resolveReminderLeads, skipReasons } from "@/lib/notifications/prefs";
import { enqueueDueReminders } from "@/lib/notifications/reminders";
import { renderTemplate } from "@/lib/notifications/templates";
import { CHANNELS } from "@/lib/notifications/channels";

const NOW = new Date("2026-11-03T10:00:00Z");
const H = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H);

const booking = (over: Record<string, any> = {}) => ({
  id: "a1", businessId: "b1", date: at(20), duration: 30, price: 500, notes: null, patientName: null, isOnline: false, meetingUrl: null,
  status: "confirmed", reminderSent: false, createdAt: at(-72), tokenNumber: null, estimatedAt: null, sessionDate: null, tokenSession: null,
  client: { name: "Riya Kapoor", email: "Riya@Example.test", phone: "+91 98765 43210", whatsappConsent: true },
  service: { name: "Consultation", meetingUrl: null },
  staff: { name: "Dr Rao", meetingUrl: null },
  business: {
    name: "Sunrise Clinic", slug: "sunrise", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null,
    notificationPrefs: null, plan: "pro", planStatus: "active", trialEndsAt: null,
  },
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.assign(fake.state, { rows: [], appointments: [], optouts: [], limits: { emailReminders: true, whatsappReminders: false } });
  push.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("reminder leads in the business prefs", () => {
  it("defaults to one reminder 24h before", () => {
    expect(resolvePrefs(null).reminderLeadMinutes).toEqual([1440]);
    expect(resolvePrefs({ reminderLeadMinutes: "x" }).reminderLeadMinutes).toEqual([1440]);
  });
  it("keeps at most two allowed leads, longest first; empty means off", () => {
    expect(resolveReminderLeads([120, 1440])).toEqual([1440, 120]);
    expect(resolveReminderLeads([60, 120, 2880, 45, 120])).toEqual([2880, 120]);
    expect(resolveReminderLeads([])).toEqual([]);
  });
});

describe("when a reminder is due", () => {
  const created = at(-72);
  it("from the lead until the booking starts", () => {
    expect(dueLeads(at(25), created, [1440], NOW)).toEqual([]);
    expect(dueLeads(at(24), created, [1440], NOW)).toEqual([1440]);
    expect(dueLeads(at(1), created, [1440, 120], NOW)).toEqual([1440, 120]);
    expect(dueLeads(at(0), created, [1440], NOW)).toEqual([]);
  });
  it("not for a booking made after the due time (its confirmation just went)", () => {
    expect(dueLeads(at(5), at(-1), [1440, 120], NOW)).toEqual([]);
    expect(dueLeads(at(1.5), at(-1), [1440, 120], NOW)).toEqual([120]);
  });
  it("a token booking counts back from the session start, or the estimate if later, and keys on the session", () => {
    const tz = "Asia/Kolkata"; // 09:00 IST = 03:30 UTC
    const token = { sessionDate: new Date("2026-11-04T00:00:00Z"), tokenSession: { startMin: 540 } };
    const early = reminderAnchor({ ...token, date: new Date("2026-11-04T03:30:00Z"), estimatedAt: new Date("2026-11-04T03:30:00Z") }, tz);
    const late = reminderAnchor({ ...token, date: new Date("2026-11-04T05:00:00Z"), estimatedAt: new Date("2026-11-04T05:00:00Z") }, tz);
    expect(early.at.toISOString()).toBe("2026-11-04T03:30:00.000Z");
    expect(late.at.toISOString()).toBe("2026-11-04T05:00:00.000Z");
    expect(late.version).toBe(early.version);
    expect(reminderAnchor({ date: at(5) }, tz)).toEqual({ at: at(5), version: at(5).getTime() });
  });
});

describe("the sweep", () => {
  it("queues one email per due lead, once, with a push to the owner", async () => {
    fake.state.appointments = [booking({ date: at(1.5), business: { ...booking().business, notificationPrefs: { reminderLeadMinutes: [1440, 120] } } })];
    expect(await enqueueDueReminders(NOW)).toBe(2);
    expect(await enqueueDueReminders(NOW)).toBe(0);
    expect(fake.state.rows.map((r) => r.idempotencyKey)).toEqual([
      `booking.reminder:a1:${at(1.5).getTime()}:1440:riya@example.test:EMAIL`,
      `booking.reminder:a1:${at(1.5).getTime()}:120:riya@example.test:EMAIL`,
    ]);
    expect(fake.state.rows[0]).toMatchObject({ event: REMINDER_EVENT, template: "reminder", status: "PENDING", expiresAt: at(1.5) });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[0][1]).toMatchObject({ title: "Appointment reminder", tag: "reminder-a1" });
  });
  it("a moved booking is reminded again under a new key", async () => {
    fake.state.appointments = [booking()];
    await enqueueDueReminders(NOW);
    fake.state.appointments = [booking({ date: at(22) })];
    await enqueueDueReminders(NOW);
    expect(new Set(fake.state.rows.map((r) => r.idempotencyKey)).size).toBe(2);
  });
  it("follows the plan: no email without emailReminders; WhatsApp rows when included", async () => {
    fake.state.appointments = [booking()];
    fake.state.limits = { emailReminders: false, whatsappReminders: false };
    expect(await enqueueDueReminders(NOW)).toBe(0);
    expect(push).not.toHaveBeenCalled();
    fake.state.limits = { emailReminders: false, whatsappReminders: true };
    // WhatsApp rows exist only where the business has WhatsApp set up AND the client consented.
    fake.state.whatsappOn = false;
    await enqueueDueReminders(NOW);
    expect(fake.state.rows).toHaveLength(0);
    fake.state.whatsappOn = true;
    expect(await enqueueDueReminders(NOW)).toBe(1);
    expect(fake.state.rows[0]).toMatchObject({ channel: "WHATSAPP", recipient: "919876543210" });
  });
  it("a business with reminders off queues nothing", async () => {
    fake.state.appointments = [booking({ business: { ...booking().business, notificationPrefs: { reminderLeadMinutes: [] } } })];
    expect(await enqueueDueReminders(NOW)).toBe(0);
  });
  it("an unsubscribed customer's reminder is kept as SKIPPED", async () => {
    fake.state.optouts = [{ businessId: "b1", recipient: "riya@example.test" }];
    fake.state.appointments = [booking()];
    await enqueueDueReminders(NOW);
    expect(fake.state.rows[0]).toMatchObject({ status: "SKIPPED", error: "unsubscribed" });
    // Transactional mail still goes to an unsubscribed customer.
    const reasons = await skipReasons(fake as never, [{ businessId: "b1", event: "booking.cancelled", recipient: "riya@example.test" }]);
    expect(reasons.size).toBe(0);
  });
  it("the WhatsApp channel is not set up yet, so its rows are skipped with that reason", async () => {
    expect(await CHANNELS.WHATSAPP({ subject: "s", html: "", text: "t" }, "91987", "n1")).toEqual({ kind: "skipped", error: "channel not set up" });
  });
});

describe("check at send", () => {
  const queued = async (a: Record<string, any>) => {
    fake.state.appointments = [a];
    await enqueueDueReminders(NOW);
    return fake.state.rows[0];
  };
  it("sends while the booking is unchanged", async () => {
    const row = await queued(booking());
    expect(await reminderSendCheck(row as never)).toBeNull();
  });
  it("skips a cancelled, moved or deleted booking, or a lead the business removed", async () => {
    const row = await queued(booking());
    fake.state.appointments = [booking({ status: "cancelled" })];
    expect(await reminderSendCheck(row as never)).toBe("booking cancelled");
    fake.state.appointments = [booking({ date: at(21) })];
    expect(await reminderSendCheck(row as never)).toBe("booking moved");
    fake.state.appointments = [booking({ business: { ...booking().business, notificationPrefs: { reminderLeadMinutes: [120] } } })];
    expect(await reminderSendCheck(row as never)).toBe("turned off by the business");
    fake.state.appointments = [];
    expect(await reminderSendCheck(row as never)).toBe("booking deleted");
  });
});

describe("what the reminder says", () => {
  const brand = { terms: { packId: "FITNESS" } };
  it("uses the pack wording and the date, not 'tomorrow'", async () => {
    const row = await (async () => { fake.state.appointments = [booking()]; await enqueueDueReminders(NOW); return fake.state.rows[0]; })();
    const m = await renderTemplate("reminder", row.payload, brand);
    expect(m.text).toContain("a reminder about your booking at Sunrise Clinic");
    expect(m.text).toContain("Date: ");
    expect(m.text.toLowerCase()).not.toContain("tomorrow");
  });
  it("a token booking gives the session start, the number and the tracking link", async () => {
    fake.state.appointments = [booking({
      date: new Date("2026-11-04T05:00:00Z"), estimatedAt: new Date("2026-11-04T05:00:00Z"), tokenNumber: 7,
      sessionDate: new Date("2026-11-04T00:00:00Z"), tokenSession: { name: "Morning OPD", startMin: 540 },
    })];
    await enqueueDueReminders(NOW);
    const m = await renderTemplate("reminder", fake.state.rows[0].payload, brand);
    expect(m.subject).toBe("Reminder: Morning OPD starts at 9:00 AM on Wednesday, November 4, your number is #7");
    expect(m.text).toContain("Your session starts at 9:00 AM on Wednesday, November 4. Your number is #7.");
    expect(m.text).toMatch(/Track your place: https?:\/\/\S+/);
    expect(m.html).toContain("Track your place in line");
  });
  it("an online booking includes the meeting link", async () => {
    fake.state.appointments = [booking({ isOnline: true, meetingUrl: "https://meet.example.test/abc" })];
    await enqueueDueReminders(NOW);
    const m = await renderTemplate("reminder", fake.state.rows[0].payload, brand);
    expect(m.text).toContain("Join online: https://meet.example.test/abc");
    expect(m.html).toContain("https://meet.example.test/abc");
  });
});
