import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  cfgFindUnique: vi.fn(), cfgFindMany: vi.fn(), cfgUpdate: vi.fn(),
  bizFindUnique: vi.fn(), bizFindMany: vi.fn(),
  apptFindUnique: vi.fn(), apptFindMany: vi.fn(),
  tplFindMany: vi.fn(),
  optFind: vi.fn(), optUpsert: vi.fn(),
  memberFindMany: vi.fn(), userFindMany: vi.fn(), userFindUnique: vi.fn(),
  clientFindMany: vi.fn(), clientUpdate: vi.fn(),
  limits: vi.fn(), outUpdateMany: vi.fn(), outFindUnique: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConfig: { findUnique: db.cfgFindUnique, findMany: db.cfgFindMany, update: db.cfgUpdate },
    business: { findUnique: db.bizFindUnique, findMany: db.bizFindMany },
    appointment: { findUnique: db.apptFindUnique, findMany: db.apptFindMany },
    whatsAppTemplate: { findMany: db.tplFindMany },
    whatsAppOptOut: { findUnique: db.optFind, upsert: db.optUpsert },
    teamMember: { findMany: db.memberFindMany },
    user: { findMany: db.userFindMany, findUnique: db.userFindUnique },
    client: { findMany: db.clientFindMany, update: db.clientUpdate },
    notificationOutbox: { updateMany: db.outUpdateMany, findUnique: db.outFindUnique, findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/getFeatures", () => ({ getBusinessFeatures: db.limits }));

import { encryptSecret } from "@/lib/notifications/secret";
import { TEMPLATE_DEFS, templateName } from "@/lib/whatsapp/templates";
import { WA_EVENTS, WA_PREF_DEFAULTS, buildWhatsAppMessage, clean } from "@/lib/whatsapp/events";
import { withWhatsApp } from "@/lib/whatsapp/derive";
import { recordWhatsAppConsent } from "@/lib/whatsapp/consent";
import { sendWhatsAppRow, whatsappSendBlocker } from "@/lib/whatsapp/send";
import { eligibleWhatsAppUsers } from "@/lib/whatsapp/staff";
import { stopWhatsAppFor } from "@/lib/whatsapp/optout";
import { whatsappStopLinkFor } from "@/lib/whatsapp/stopLink";
import { shownStatus } from "@/lib/notifications/log";
import { resolvePrefs } from "@/lib/notifications/prefs";
import { idempotencyKey } from "@/lib/notifications/policy";
import { REMINDER_EVENT } from "@/lib/notifications/reminderRules";
import type { NotificationInput } from "@/lib/notifications/enqueue";
import { attemptNow } from "@/lib/notifications/process";

process.env.NEXTAUTH_SECRET = "test-secret";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const txdb = {
  whatsAppConfig: { findMany: db.cfgFindMany }, appointment: { findMany: db.apptFindMany }, business: { findMany: db.bizFindMany },
} as never;

const PAYLOAD = {
  clientName: "Riya Kapoor", businessName: "Sunrise Clinic", serviceName: "Consultation", date: "Sat 15 Nov", time: "4:30 PM",
  token: undefined as undefined | { number: number; estimatedTime: string; sessionName: string },
  trackUrl: undefined as undefined | string,
};
const emailItem = (over: Partial<NotificationInput> = {}): NotificationInput => ({
  event: "booking.created", audience: "CUSTOMER", subjectId: "a1", recipient: "riya@example.test", template: "confirmation",
  payload: PAYLOAD, businessId: "b1", appointmentId: "a1", ...over,
});
const waRow = (over: Record<string, unknown> = {}) => ({
  id: "o1", businessId: "b1", event: "booking.created", audience: "CUSTOMER", channel: "WHATSAPP", recipient: "919876543210",
  appointmentId: "a1", template: "confirmation", payload: PAYLOAD, status: "SENDING", attempts: 1, ...over,
}) as never;

const cfg = (status = "CONNECTED") => ({ status, phoneNumberId: "111", wabaId: "222", accessTokenEnc: encryptSecret("TOKEN"), appSecretEnc: encryptSecret("S") });
const goodWorld = () => {
  db.cfgFindUnique.mockResolvedValue(cfg());
  db.bizFindUnique.mockResolvedValue({ ownerId: "u-owner", name: "Sunrise Clinic", notificationPrefs: null });
  db.limits.mockResolvedValue({ whatsappReminders: true });
  db.apptFindUnique.mockResolvedValue({ businessId: "b1", client: { phone: "+919876543210", whatsappConsent: true } });
  db.optFind.mockResolvedValue(null);
  db.tplFindMany.mockResolvedValue([{ language: "en" }]);
};
beforeEach(() => { vi.resetAllMocks(); });

describe("every customer email event maps to a template", () => {
  const EVENTS = ["booking.created", "booking.rescheduled", "booking.cancelled", "booking.meeting_link", "booking.paid", "booking.completed", "booking.no_show", REMINDER_EVENT, "booking.queue_moved_back", "booking.queue_closed", "booking.queue_next", "booking.review_request"];
  const full = { ...PAYLOAD, token: { number: 14, estimatedTime: "4:30 PM", sessionName: "Morning" }, trackUrl: "https://calvy.io/sunrise/q/a1.sig", meetingUrl: "https://meet.example.test/x", reviewUrl: "https://g.page/r/abc/review", place: 5 };
  it("all 12 events are mapped, produce the exact variable count, and a button suffix only when the template has a button", () => {
    expect(Object.keys(WA_EVENTS).sort()).toEqual([...EVENTS].sort());
    for (const event of EVENTS) {
      const m = buildWhatsAppMessage(event, full, "CUSTOMER");
      expect(m, event).not.toBeNull();
      const def = TEMPLATE_DEFS.find((d) => d.key === m!.key)!;
      expect(def, `${event} -> ${m!.key}`).toBeTruthy();
      expect(m!.params.length, event).toBe(def.params.length);
      expect(!!m!.buttonSuffix, event).toBe(!!def.button);
      for (const p of m!.params) expect(p).not.toMatch(/[\n\t]| {2}/);
    }
  });
  it("a token booking uses the token template; a plain one the booking template", () => {
    expect(buildWhatsAppMessage("booking.created", full, "CUSTOMER")?.key).toBe("token_issued");
    expect(buildWhatsAppMessage("booking.created", PAYLOAD, "CUSTOMER")?.key).toBe("booking_confirmed");
    expect(buildWhatsAppMessage("booking.created", PAYLOAD, "CUSTOMER")?.params).toEqual(["Riya", "Consultation", "Sunrise Clinic", "Sat 15 Nov, 4:30 PM"]);
    expect(buildWhatsAppMessage("booking.created", { ...full, trackUrl: undefined }, "CUSTOMER")).toBeNull(); // button needs a link: no WhatsApp rather than a failed send
  });
  it("no message carries the customer's email or phone", () => {
    for (const event of EVENTS) {
      const m = buildWhatsAppMessage(event, { ...full, clientEmail: "riya@example.test", clientPhone: "+919876543210" }, "CUSTOMER")!;
      expect(JSON.stringify(m)).not.toMatch(/riya@example|9876543210/);
    }
  });
  it("variables are cleaned the way Meta needs; review request is off by default, the rest on", () => {
    expect(clean("a\nb\t c   d")).toBe("a b c d");
    expect(clean("   ", "x")).toBe("x");
    expect(WA_PREF_DEFAULTS).toEqual({ confirmations: true, changes: true, reminders: true, token: true, turnSoon: true, receipts: true, thanks: true, followUp: true, reviewRequest: false });
    expect(resolvePrefs(null).whatsapp.reviewRequest).toBe(false);
    expect(resolvePrefs({ whatsapp: { reviewRequest: true, reminders: false } }).whatsapp).toMatchObject({ reviewRequest: true, reminders: false, confirmations: true });
  });
  it("template names are unique and booking templates dropped the button (v2)", () => {
    expect(new Set(TEMPLATE_DEFS.map((d) => templateName(d.key))).size).toBe(TEMPLATE_DEFS.length);
    for (const k of ["booking_confirmed", "booking_reminder", "booking_rescheduled"]) {
      expect(templateName(k)).toBe(`calvy_${k}_v2`);
      expect(TEMPLATE_DEFS.find((d) => d.key === k)?.button).toBeUndefined();
    }
  });
});

describe("consent and E.164", () => {
  it("records consent only when the typed number is the client's own (normalized, +91 default)", async () => {
    const now = new Date("2026-11-12T10:00:00Z");
    expect(await recordWhatsAppConsent({ client: { update: db.clientUpdate } } as never, { id: "c1", phone: "+919876543210" }, "98765 43210", "Asia/Kolkata", "booking_form", now)).toBe(true);
    expect(db.clientUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { whatsappConsent: true, whatsappConsentAt: now, whatsappConsentSource: "booking_form", whatsappConsentBy: null } });
  });
  it("does not opt in a number the booking could not claim (spoofed or someone else's)", async () => {
    const tx = { client: { update: db.clientUpdate } } as never;
    expect(await recordWhatsAppConsent(tx, { id: "c1", phone: null }, "9876543210", "Asia/Kolkata", "chat_widget")).toBe(false);
    expect(await recordWhatsAppConsent(tx, { id: "c1", phone: "+911111111111" }, "9876543210", "Asia/Kolkata", "chat_widget")).toBe(false);
    expect(await recordWhatsAppConsent(tx, { id: "c1", phone: "+919876543210" }, "not a number", "Asia/Kolkata", "chat_widget")).toBe(false);
    expect(db.clientUpdate).not.toHaveBeenCalled();
  });
});

describe("deriving WhatsApp rows from email events (enqueue)", () => {
  const world = (over: { configured?: boolean; consent?: boolean; prefs?: unknown } = {}) => {
    db.cfgFindMany.mockResolvedValue(over.configured === false ? [] : [{ businessId: "b1" }]);
    db.apptFindMany.mockResolvedValue([{ id: "a1", businessId: "b1", client: { phone: "+919876543210", whatsappConsent: over.consent ?? true } }]);
    db.bizFindMany.mockResolvedValue([{ id: "b1", notificationPrefs: over.prefs ?? null }]);
  };
  it("email is always kept; a WhatsApp clone is added for a consenting client", async () => {
    world();
    const out = await withWhatsApp(txdb, [emailItem()]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(emailItem());
    expect(out[1]).toMatchObject({ channel: "WHATSAPP", recipient: "+919876543210", event: "booking.created" });
    expect(out[1].skipReason).toBeUndefined();
  });
  it("no consent, or no WhatsApp set up: email only, nothing logged for WhatsApp", async () => {
    world({ consent: false });
    expect(await withWhatsApp(txdb, [emailItem()])).toHaveLength(1);
    world({ configured: false });
    expect(await withWhatsApp(txdb, [emailItem()])).toHaveLength(1);
  });
  it("explicit WhatsApp reminders without consent are dropped, with consent kept", async () => {
    const reminder = emailItem({ event: REMINDER_EVENT, template: "reminder", channel: "WHATSAPP", recipient: "919876543210" });
    world({ consent: false });
    expect(await withWhatsApp(txdb, [reminder])).toHaveLength(0);
    world();
    expect(await withWhatsApp(txdb, [reminder])).toHaveLength(1);
  });
  it("a switched-off event is recorded as SKIPPED with the reason, email untouched", async () => {
    world({ prefs: { whatsapp: { confirmations: false } } });
    const out = await withWhatsApp(txdb, [emailItem()]);
    expect(out[1].skipReason).toBe("turned off by the business");
    expect(out[0].skipReason).toBeUndefined();
  });
  it("events with no WhatsApp message (account mail, owner alerts) are untouched", async () => {
    world();
    const items = [emailItem({ event: "auth.verify", audience: "BUSINESS" as never }), emailItem({ event: "alert.booking.created", audience: "BUSINESS" as never })];
    expect(await withWhatsApp(txdb, items)).toEqual(items);
  });
  it("idempotent: the same event twice gives the same WhatsApp key, distinct from the email key", async () => {
    world();
    const a = (await withWhatsApp(txdb, [emailItem()]))[1];
    const b = (await withWhatsApp(txdb, [emailItem()]))[1];
    const key = (n: NotificationInput) => idempotencyKey({ event: n.event, subjectId: n.subjectId, version: n.version, recipient: n.recipient, channel: n.channel ?? "EMAIL" });
    expect(key(a)).toBe(key(b));
    expect(key(a)).not.toBe(key(emailItem()));
  });
});

describe("send-time gates (no send without consent, STOP, approval, connection)", () => {
  it("all gates open: null", async () => { goodWorld(); expect(await whatsappSendBlocker(waRow())).toBeNull(); });
  it.each([
    ["no consent", () => db.apptFindUnique.mockResolvedValue({ businessId: "b1", client: { phone: "+919876543210", whatsappConsent: false } }), "no WhatsApp consent"],
    ["STOP opt-out", () => db.optFind.mockResolvedValue({ phone: "+919876543210" }), "customer opted out (STOP)"],
    ["connection paused", () => db.cfgFindUnique.mockResolvedValue(cfg("ERROR")), "WhatsApp connection needs attention (paused)"],
    ["plan without WhatsApp", () => db.limits.mockResolvedValue({ whatsappReminders: false }), "WhatsApp is not on this plan"],
    ["number changed since queued", () => db.apptFindUnique.mockResolvedValue({ businessId: "b1", client: { phone: "+911111111111", whatsappConsent: true } }), "phone number changed"],
    ["event switched off", () => db.bizFindUnique.mockResolvedValue({ ownerId: "u-owner", name: "S", notificationPrefs: { whatsapp: { confirmations: false } } }), "turned off by the business"],
    ["another business's booking", () => db.apptFindUnique.mockResolvedValue({ businessId: "other", client: { phone: "+919876543210", whatsappConsent: true } }), "booking not found"],
  ])("%s -> skipped", async (_n, arrange, reason) => {
    goodWorld(); arrange();
    expect(await whatsappSendBlocker(waRow())).toBe(reason);
    const f = vi.fn();
    expect(await sendWhatsAppRow(waRow(), f as never)).toEqual({ kind: "skipped", error: reason });
    expect(f).not.toHaveBeenCalled(); // never reaches Meta
  });
  it("follow-up switch off: the combined thank-you falls back to the plain one; on: combined, with the deadline", async () => {
    goodWorld();
    const row = waRow({ event: "booking.completed", payload: { ...PAYLOAD, followUpUntil: "2 Dec" } });
    const f = vi.fn(async () => json({ messages: [{ id: "wamid.1" }] }));
    await sendWhatsAppRow(row, f as never);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).template.name).toBe("calvy_visit_thanks_follow_up_v1");
    db.bizFindUnique.mockResolvedValue({ ownerId: "u-owner", name: "Sunrise Clinic", notificationPrefs: { whatsapp: { followUp: false } } });
    const g = vi.fn(async () => json({ messages: [{ id: "wamid.2" }] }));
    await sendWhatsAppRow(row, g as never);
    expect(JSON.parse((g.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).template.name).toBe("calvy_visit_thanks_v1");
  });
  it("template not APPROVED -> skipped, Meta never called", async () => {
    goodWorld(); db.tplFindMany.mockResolvedValue([]);
    const f = vi.fn();
    expect(await sendWhatsAppRow(waRow(), f as never)).toEqual({ kind: "skipped", error: "template not approved yet" });
    expect(f).not.toHaveBeenCalled();
  });
  it("sends the approved template with the right variables and records Meta's message id (for delivery status)", async () => {
    goodWorld();
    const f = vi.fn(async () => json({ messages: [{ id: "wamid.XYZ" }] }));
    expect(await sendWhatsAppRow(waRow(), f as never)).toEqual({ kind: "sent", providerId: "wamid.XYZ" });
    const call = f.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.to).toBe("919876543210");
    expect(body.template.name).toBe("calvy_booking_confirmed_v2");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Riya", "Consultation", "Sunrise Clinic", "Sat 15 Nov, 4:30 PM"]);
  });
  it("API errors: 5xx/429 retry, other 4xx permanent (email already went), dead token pauses WhatsApp", async () => {
    goodWorld();
    expect(await sendWhatsAppRow(waRow(), vi.fn(async () => json({ error: { message: "oops" } }, 500)) as never)).toMatchObject({ kind: "retry" });
    expect(await sendWhatsAppRow(waRow(), vi.fn(async () => json({ error: { code: 131048, message: "spam" } }, 429)) as never)).toMatchObject({ kind: "retry" });
    expect(await sendWhatsAppRow(waRow(), vi.fn(async () => json({ error: { code: 131026, message: "undeliverable" } }, 400)) as never)).toMatchObject({ kind: "permanent", error: "undeliverable" });
    db.cfgUpdate.mockResolvedValue({});
    const out = await sendWhatsAppRow(waRow(), vi.fn(async () => json({ error: { code: 190, message: "bad token" } }, 401)) as never);
    expect(out).toMatchObject({ kind: "skipped" });
    expect(db.cfgUpdate.mock.calls[0][0].data.status).toBe("ERROR");
  });
});

describe("business alerts: opt-in and the same permission rules as push", () => {
  const owner = { id: "u-owner", whatsappPhone: "+911000000001", pushPreference: null };
  const viewAll = { id: "u-all", whatsappPhone: "+911000000002", pushPreference: null };
  const ownOnly = { id: "u-own", whatsappPhone: "+911000000003", pushPreference: null };
  const nobody = { id: "u-none", whatsappPhone: "+911000000004", pushPreference: null };
  const muted = { id: "u-muted", whatsappPhone: "+911000000005", pushPreference: { newBooking: false } };
  beforeEach(() => {
    db.cfgFindUnique.mockResolvedValue(cfg());
    db.bizFindUnique.mockResolvedValue({ ownerId: "u-owner" });
    db.memberFindMany.mockResolvedValue([
      { userId: "u-all", permissions: ["appointments.view_all"], staffId: null },
      { userId: "u-own", permissions: ["appointments.view_own"], staffId: "s1" },
      { userId: "u-none", permissions: ["customers.view"], staffId: null },
      { userId: "u-muted", permissions: ["appointments.view_all"], staffId: null },
    ]);
    db.userFindMany.mockResolvedValue([owner, viewAll, ownOnly, nobody, muted]);
  });
  const ids = async (kind: never, staff: string | null) => (await eligibleWhatsAppUsers("b1", kind, staff)).map((u) => u.id).sort();
  it("a booking for staff s1: owner, view-all and the own-only member of s1; not the no-permission or muted member", async () => {
    expect(await ids("booking_new" as never, "s1")).toEqual(["u-all", "u-own", "u-owner"]);
  });
  it("a booking for another staff member never reaches an own-only member", async () => {
    expect(await ids("booking_new" as never, "s2")).toEqual(["u-all", "u-owner"]);
  });
  it("payments need reports access: only the owner here", async () => {
    expect(await ids("payment" as never, null)).toEqual(["u-owner"]);
  });
  it("kinds with no WhatsApp alert (queue, summary) and a paused connection send nothing", async () => {
    expect(await ids("queue" as never, null)).toEqual([]);
    db.cfgFindUnique.mockResolvedValue(cfg("ERROR"));
    expect(await ids("booking_new" as never, "s1")).toEqual([]);
  });
  it("only opted-in, verified people are even looked up", async () => {
    await eligibleWhatsAppUsers("b1", "booking_new", "s1");
    expect(db.userFindMany.mock.calls[0][0].where).toMatchObject({ whatsappOptIn: true, whatsappVerifiedAt: { not: null }, whatsappPhone: { not: null } });
  });
  it("send-time re-check: access revoked or opt-in withdrawn since queued -> skipped", async () => {
    const row = waRow({ audience: "BUSINESS", event: "push.booking_new", recipient: "+911000000003", appointmentId: null, payload: { kind: "booking_new", staffId: "s2", userId: "u-own", title: "New booking", body: "Riya K." } });
    goodWorld();
    db.userFindUnique.mockResolvedValue({ whatsappPhone: "+911000000003", whatsappOptIn: true, whatsappVerifiedAt: new Date(), pushPreference: null, teamMember: { businessId: "b1", permissions: ["appointments.view_own"], staffId: "s1" } });
    expect(await whatsappSendBlocker(row)).toBe("no longer allowed"); // booking is s2's, member is s1
    db.userFindUnique.mockResolvedValue({ whatsappPhone: "+911000000003", whatsappOptIn: false, whatsappVerifiedAt: new Date(), pushPreference: null, teamMember: null });
    expect(await whatsappSendBlocker(row)).toBe("no WhatsApp opt-in");
  });
  it("the alert text is the scrubbed alert, through the one generic template", () => {
    const m = buildWhatsAppMessage("push.booking_new", { title: "New booking", body: "Riya K. · Haircut · Sat 15 Nov 4:30 PM", businessName: "Sunrise" }, "BUSINESS")!;
    expect(m.key).toBe("staff_alert");
    expect(m.params).toEqual(["Sunrise", "New booking: Riya K. · Haircut · Sat 15 Nov 4:30 PM."]);
  });
});

describe("customer opt-out and the delivery log", () => {
  it("the email link clears consent and adds the number to the business's STOP list", async () => {
    db.clientFindMany.mockResolvedValue([{ id: "c1", phone: "+919876543210" }]);
    expect(await stopWhatsAppFor("b1", "riya@example.test")).toBe(1);
    expect(db.clientUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { whatsappConsent: false } });
    expect(db.optUpsert.mock.calls[0][0].create).toEqual({ businessId: "b1", phone: "+919876543210" });
  });
  it("the 'Stop WhatsApp updates' link is shown only to customers who opted in, only in customer booking emails", async () => {
    const row = { channel: "EMAIL", audience: "CUSTOMER", businessId: "b1", appointmentId: "a1", event: "booking.created", recipient: "riya@example.test" };
    db.cfgFindUnique.mockResolvedValue(cfg());
    db.apptFindUnique.mockResolvedValue({ businessId: "b1", client: { whatsappConsent: true } });
    expect(await whatsappStopLinkFor(row)).toMatch(/\/unsubscribe\?.*&ch=wa$/);
    db.apptFindUnique.mockResolvedValue({ businessId: "b1", client: { whatsappConsent: false } });
    expect(await whatsappStopLinkFor(row)).toBeUndefined();
    expect(await whatsappStopLinkFor({ ...row, audience: "BUSINESS" })).toBeUndefined();
    db.cfgFindUnique.mockResolvedValue(null);
    expect(await whatsappStopLinkFor(row)).toBeUndefined();
  });
  it("the log shows delivered / read / failed (with Meta's reason) for sent WhatsApp rows", () => {
    const base = { channel: "WHATSAPP", status: "SENT", error: null, deliveryError: null };
    expect(shownStatus({ ...base, deliveryStatus: null })).toEqual({ status: "SENT", error: null });
    expect(shownStatus({ ...base, deliveryStatus: "delivered" }).status).toBe("DELIVERED");
    expect(shownStatus({ ...base, deliveryStatus: "read" }).status).toBe("READ");
    expect(shownStatus({ ...base, deliveryStatus: "failed", deliveryError: "131026 undeliverable" })).toEqual({ status: "FAILED", error: "131026 undeliverable" });
    expect(shownStatus({ channel: "EMAIL", status: "SENT", deliveryStatus: "read", error: null, deliveryError: null }).status).toBe("SENT");
  });
});

describe("through the outbox (retries, fallback to email only)", () => {
  const settled = () => db.outUpdateMany.mock.calls.map((c) => c[0]).find((c) => c.data.status && c.data.status !== "SENDING");
  it("a WhatsApp row that fails a gate is recorded SKIPPED with the reason; nothing is sent", async () => {
    goodWorld();
    db.bizFindMany.mockResolvedValue([]);
    db.apptFindUnique.mockResolvedValue({ businessId: "b1", client: { phone: "+919876543210", whatsappConsent: false } });
    db.outUpdateMany.mockResolvedValue({ count: 1 });
    db.outFindUnique.mockResolvedValue(waRow({ nextAttemptAt: new Date(), lockedUntil: null, expiresAt: null, secret: null, createdAt: new Date() }));
    await attemptNow(["o1"]);
    expect(settled()?.data).toMatchObject({ status: "SKIPPED", error: "no WhatsApp consent" });
  });
  it("Meta 5xx is retried later by the outbox (not failed)", async () => {
    goodWorld();
    db.bizFindMany.mockResolvedValue([]);
    db.outUpdateMany.mockResolvedValue({ count: 1 });
    db.outFindUnique.mockResolvedValue(waRow({ nextAttemptAt: new Date(), lockedUntil: null, expiresAt: null, secret: null, createdAt: new Date() }));
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => json({ error: { message: "down" } }, 503)) as never;
    try { await attemptNow(["o1"]); } finally { globalThis.fetch = real; }
    expect(settled()?.data).toMatchObject({ status: "PENDING", error: "down" });
  });
});
