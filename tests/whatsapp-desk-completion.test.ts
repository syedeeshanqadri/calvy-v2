import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const db: Record<string, any> = {
    tokenSession: { findFirst: vi.fn() },
    appointment: { findMany: vi.fn(), update: vi.fn(async () => ({})), findFirst: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(async () => ({ _max: { tokenNumber: 4 } })), create: vi.fn(async () => ({})), count: vi.fn(async () => 0) },
    business: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
    staff: { findUnique: vi.fn() },
    service: { findFirst: vi.fn() },
    client: { update: vi.fn(async () => ({})) },
    whatsAppConfig: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
    whatsAppOptOut: { findUnique: vi.fn(async () => null) },
    notificationOptOut: { findMany: vi.fn(async () => []) },
    notificationOutbox: { findFirst: vi.fn(async () => null), createMany: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
    $executeRaw: vi.fn(async () => 0),
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return { db, notify: vi.fn(async (..._items: unknown[]) => {}), findOrCreate: vi.fn(), credit: vi.fn(async () => null) };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/notifications/enqueue", async () => ({ ...(await vi.importActual<object>("@/lib/notifications/enqueue")), notify: mocks.notify }));
vi.mock("@/lib/creditDb", () => ({ creditClosedBooking: mocks.credit }));
vi.mock("@/lib/clients", () => ({ findOrCreateClient: mocks.findOrCreate }));
vi.mock("@/lib/getFeatures", () => ({
  getEffectiveLimits: vi.fn(async () => ({ maxMonthlyAppointments: -1 })),
  getBusinessFeatures: vi.fn(async () => ({ whatsappReminders: true })),
}));

import { addWalkIn, runQueueAction, type QueueBusiness } from "@/lib/queueDb";
import { enqueue } from "@/lib/notifications/enqueue";
import { queueClosed, queueMovedBack, queueNext, statusChange, confirmation, reschedule, type Notice } from "@/lib/notifications/events";
import { recordWhatsAppConsent } from "@/lib/whatsapp/consent";
import { whatsappSendBlocker } from "@/lib/whatsapp/send";
import { idempotencyKey } from "@/lib/notifications/policy";
import { encryptSecret } from "@/lib/notifications/secret";

process.env.NEXTAUTH_SECRET = "test-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://calvy.io";
const biz: QueueBusiness = { id: "biz1", timezone: "Asia/Kolkata", name: "Sunrise", packId: "CLINIC", termsOverride: null, currency: "INR" };
const session = { id: "s1", businessId: "biz1", name: "Morning", startMin: 540, endMin: 720, minutesPerToken: 10, staffId: "st1", weekdays: [1], isActive: true };
const token = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${n}`, businessId: "biz1", tokenNumber: n, queuePosition: n, queueState: n === 1 ? "SERVING" : "WAITING", notPresentCount: 0, carriedFromId: null,
  servingStartedAt: n === 1 ? new Date("2026-11-02T03:30:00Z") : null, status: "confirmed", source: "ONLINE", isOnline: false, meetingUrl: null,
  patientName: null, price: 500, clientId: `c${n}`,
  client: { name: `Client ${n}`, email: `c${n}@example.com`, phone: null, whatsappConsent: false }, service: { name: "Checkup", meetingUrl: null }, staff: { meetingUrl: null }, ...over,
});
const businessRow = { name: "Sunrise", slug: "sunrise", packId: "CLINIC", termsOverride: null, currency: "INR", timezone: "Asia/Kolkata", notificationPrefs: null, followUpDays: 30, googleReviewUrl: null, email: "owner@example.com", owner: { email: "owner@example.com" } };
type Queued = { event: string; template: string; subjectId: string; recipient: string; version?: number; payload: Record<string, any> };
const queued = () => mocks.notify.mock.calls.flatMap((c) => c).filter(Boolean) as Queued[];
const key = (n: Queued) => idempotencyKey({ event: n.event, subjectId: n.subjectId, version: n.version, recipient: n.recipient, channel: "EMAIL" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.tokenSession.findFirst.mockResolvedValue(session);
  mocks.db.business.findUnique.mockResolvedValue(businessRow);
  mocks.db.whatsAppConfig.findUnique.mockResolvedValue({ status: "CONNECTED" });
});

/** The booking as the completion step reads it after the queue action committed it as completed. */
const completedBooking = (over: Record<string, unknown> = {}) => ({
  ...token(1, { status: "completed", queueState: "DONE" }),
  id: "a1", followUpOfId: null, staffId: "st1", serviceId: "svc1", date: new Date("2026-11-02T04:00:00Z"), notes: null, duration: 10, estimatedAt: new Date("2026-11-02T04:00:00Z"),
  tokenSession: { name: "Morning", startMin: 540 }, business: businessRow, ...over,
});

describe("serving a token completes the previous one: the same 'visit completed' event as appointments", () => {
  const next = () => runQueueAction(biz, { sessionId: "s1", date: "2026-11-02", action: "next" });
  beforeEach(() => {
    mocks.db.appointment.findMany.mockResolvedValue([token(1), token(2)]);
    mocks.db.appointment.findFirst.mockResolvedValueOnce(completedBooking()).mockResolvedValue(null); // the booking, then "no follow-up used yet"
  });
  it("queues the thank-you (with the follow-up deadline), the owner alert and nothing else extra", async () => {
    await next();
    const thanks = queued().find((q) => q.event === "booking.completed")!;
    expect(thanks).toMatchObject({ template: "status_change", subjectId: "a1", recipient: "c1@example.com", payload: { status: "completed", followUpUntil: expect.stringMatching(/Dec/) } });
    expect(queued().find((q) => q.event === "alert.booking.status")).toMatchObject({ subjectId: "a1", version: "completed" });
  });
  it("follow-up rules are identical: off, already used, or no doctor means a plain thank-you", async () => {
    mocks.db.appointment.findFirst.mockReset();
    mocks.db.appointment.findFirst.mockResolvedValueOnce(completedBooking({ business: { ...businessRow, followUpDays: 0 } })).mockResolvedValue(null);
    await next();
    expect(queued().find((q) => q.event === "booking.completed")!.payload).not.toHaveProperty("followUpUntil");
    mocks.notify.mockClear(); mocks.db.appointment.findFirst.mockReset();
    mocks.db.appointment.findFirst.mockResolvedValueOnce(completedBooking()).mockResolvedValueOnce({ id: "f1" }); // a follow-up already exists
    await next();
    expect(queued().find((q) => q.event === "booking.completed")!.payload).not.toHaveProperty("followUpUntil");
    mocks.notify.mockClear(); mocks.db.appointment.findFirst.mockReset();
    mocks.db.appointment.findFirst.mockResolvedValueOnce(completedBooking({ staffId: null })).mockResolvedValue(null);
    await next();
    expect(queued().find((q) => q.event === "booking.completed")!.payload).not.toHaveProperty("followUpUntil");
  });
  it("one event per booking: completing it in the queue and then marking it completed elsewhere share every key", async () => {
    await next();
    const first = queued().filter((q) => q.event === "booking.completed" || q.event === "alert.booking.status").map(key).sort();
    // The appointments screen builds the same items through the same function, for the same booking.
    const { visitCompletedItems } = await import("@/lib/notifications/completion");
    const { noticeFrom } = await import("@/lib/notifications/events");
    const full = completedBooking() as never;
    const items = await visitCompletedItems(noticeFrom(full), full, "https://calvy.io/sunrise");
    const second = [items.customer!, items.owner!].map((i) => key(i as never)).sort();
    expect(second).toEqual(first);
  });
  it("the outbox itself drops the repeat (same key, createMany skipDuplicates)", async () => {
    mocks.db.whatsAppConfig.findMany.mockResolvedValue([]);
    const n: Notice = { appointmentId: "a1", businessId: "biz1", to: "c1@example.com", payload: { clientName: "Client 1", businessName: "Sunrise", serviceName: "Checkup", date: "Mon 2 Nov", time: "10:00 AM" } as never };
    await enqueue(mocks.db as never, [statusChange(n, "completed", "https://x.test")!]);
    await enqueue(mocks.db as never, [statusChange(n, "completed", "https://x.test")!]);
    const [a, b] = mocks.db.notificationOutbox.createMany.mock.calls.map((c: any) => c[0]);
    expect(a.data[0].idempotencyKey).toBe(b.data[0].idempotencyKey);
    expect(b.skipDuplicates).toBe(true);
  });
  it("a token that is not completed (a miss, a cancel) does not fire it", async () => {
    mocks.db.appointment.findMany.mockResolvedValue([token(1), token(2)]);
    mocks.db.appointment.findFirst.mockReset();
    await runQueueAction(biz, { sessionId: "s1", date: "2026-11-02", action: "not_present", appointmentId: "a1" });
    expect(queued().some((q) => q.event === "booking.completed")).toBe(false);
  });
});

describe("WhatsApp without email (phone + consent)", () => {
  const phoneOnly: Notice = { appointmentId: "a1", businessId: "biz1", to: null, whatsapp: true, payload: { clientName: "Walk In", businessName: "Sunrise", serviceName: "Checkup", date: "Mon 2 Nov", time: "10:00 AM", token: { number: 7, estimatedTime: "10:30 AM", sessionName: "Morning" }, trackUrl: "https://calvy.io/sunrise/q/a1.sig" } as never };
  it("thanks, token-next, moved-back and closed are built for a phone-only client; email stays empty", () => {
    expect(statusChange(phoneOnly, "completed", "https://x.test", "2 Dec")).toMatchObject({ event: "booking.completed", recipient: "" });
    expect(queueNext(phoneOnly, 2, 0)).toMatchObject({ event: "booking.queue_next", recipient: "" });
    expect(queueMovedBack(phoneOnly, 3, 1)).toMatchObject({ event: "booking.queue_moved_back", recipient: "" });
    expect(queueClosed(phoneOnly, { reason: "missed" })).toMatchObject({ event: "booking.queue_closed", recipient: "" });
  });
  it("no email AND no consent: nothing at all; other events (confirmation, reschedule, no-show) never go phone-only", () => {
    const none = { ...phoneOnly, whatsapp: false };
    expect([statusChange(none, "completed"), queueNext(none, 2, 0), queueMovedBack(none, 3, 1), queueClosed(none, { reason: "missed" })]).toEqual([null, null, null, null]);
    expect(confirmation(phoneOnly, new Date())).toBeNull();
    expect(reschedule(phoneOnly, { from: new Date(), to: new Date(), oldDate: "a", oldTime: "b" })).toBeNull();
    expect(statusChange(phoneOnly, "no_show")).toBeNull();
  });
  it("enqueue: the email row is recorded SKIPPED 'no email address'; the WhatsApp row goes to the phone", async () => {
    mocks.db.whatsAppConfig.findMany.mockResolvedValue([{ businessId: "biz1" }]);
    mocks.db.appointment.findMany.mockResolvedValue([{ id: "a1", businessId: "biz1", client: { phone: "+919876543210", whatsappConsent: true } }]);
    mocks.db.business.findMany.mockResolvedValue([{ id: "biz1", notificationPrefs: null }]);
    await enqueue(mocks.db as never, [queueNext(phoneOnly, 2, 0)!]);
    const rows = mocks.db.notificationOutbox.createMany.mock.calls[0][0].data as { channel: string; recipient: string; status?: string; error?: string }[];
    expect(rows.find((r) => r.channel === "EMAIL")).toMatchObject({ recipient: "", status: "SKIPPED", error: "no email address" });
    expect(rows.find((r) => r.channel === "WHATSAPP")).toMatchObject({ recipient: "919876543210" });
    expect(rows.find((r) => r.channel === "WHATSAPP")?.status).toBeUndefined(); // PENDING: it will be sent
  });
  it("no consent on file: only the (skipped) email row exists, no WhatsApp row", async () => {
    mocks.db.whatsAppConfig.findMany.mockResolvedValue([{ businessId: "biz1" }]);
    mocks.db.appointment.findMany.mockResolvedValue([{ id: "a1", businessId: "biz1", client: { phone: "+919876543210", whatsappConsent: false } }]);
    mocks.db.business.findMany.mockResolvedValue([{ id: "biz1", notificationPrefs: null }]);
    await enqueue(mocks.db as never, [queueNext(phoneOnly, 2, 0)!]);
    const rows = mocks.db.notificationOutbox.createMany.mock.calls[0][0].data as { channel: string }[];
    expect(rows.map((r) => r.channel)).toEqual(["EMAIL"]);
  });
  it("same STOP / opt-out / consent rules at send time", async () => {
    const row = { businessId: "biz1", event: "booking.queue_next", audience: "CUSTOMER", recipient: "919876543210", appointmentId: "a1", payload: {} } as never;
    mocks.db.whatsAppConfig.findUnique.mockResolvedValue({ status: "CONNECTED", accessTokenEnc: encryptSecret("t") });
    mocks.db.business.findUnique.mockResolvedValue({ ownerId: "o", name: "Sunrise", notificationPrefs: null });
    mocks.db.appointment.findUnique.mockResolvedValue({ businessId: "biz1", client: { phone: "+919876543210", whatsappConsent: true } });
    expect(await whatsappSendBlocker(row)).toBeNull();
    mocks.db.whatsAppOptOut.findUnique.mockResolvedValue({ phone: "+919876543210" });
    expect(await whatsappSendBlocker(row)).toBe("customer opted out (STOP)");
    mocks.db.whatsAppOptOut.findUnique.mockResolvedValue(null);
    mocks.db.appointment.findUnique.mockResolvedValue({ businessId: "biz1", client: { phone: "+919876543210", whatsappConsent: false } });
    expect(await whatsappSendBlocker(row)).toBe("no WhatsApp consent");
  });
  it("end to end: a phone-only token served at reception is told 'your turn is near' and the thank-you", async () => {
    const walkIn = (n: number) => token(n, { client: { name: `Walk ${n}`, email: null, phone: "+9198765432" + n + "0", whatsappConsent: true } });
    mocks.db.appointment.findMany.mockResolvedValue([walkIn(1), walkIn(2), walkIn(3)]);
    mocks.db.appointment.findFirst.mockResolvedValueOnce(completedBooking({ client: { name: "Walk 1", email: null, phone: "+919876543210", whatsappConsent: true } })).mockResolvedValue(null);
    await runQueueAction(biz, { sessionId: "s1", date: "2026-11-02", action: "next" });
    expect(queued().find((q) => q.event === "booking.completed")).toMatchObject({ recipient: "", subjectId: "a1" });
    expect(queued().filter((q) => q.event === "booking.queue_next").map((q) => q.subjectId)).toEqual(["a3"]);
  });
});

describe("walk-in desk consent", () => {
  const setup = (offered = true) => {
    mocks.db.service.findFirst.mockResolvedValue({ id: "svc1", price: 500 });
    mocks.db.appointment.findMany.mockResolvedValue([]);
    mocks.findOrCreate.mockResolvedValue({ id: "c9", phone: "+919876543210" });
    mocks.db.whatsAppConfig.findUnique.mockResolvedValue(offered ? { status: "CONNECTED" } : null);
  };
  const walkIn = (extra: object = {}) =>
    addWalkIn({ ...biz, plan: "pro", planStatus: "active", trialEndsAt: null }, { sessionId: "s1", date: "2026-11-02", name: "Asha", phone: "98765 43210", ...extra });
  beforeEach(() => { mocks.db.tokenSession.findFirst.mockResolvedValue({ ...session, weekdays: [0, 1, 2, 3, 4, 5, 6] }); });
  it("ticked: consent source DESK with the staff user id and a timestamp", async () => {
    setup();
    await walkIn({ whatsappConsent: true, consentBy: "user-77" });
    const call = mocks.db.client.update.mock.calls.find((c: any) => c[0].data.whatsappConsent === true)![0];
    expect(call).toMatchObject({ where: { id: "c9" }, data: { whatsappConsent: true, whatsappConsentSource: "DESK", whatsappConsentBy: "user-77" } });
    expect(call.data.whatsappConsentAt).toBeInstanceOf(Date);
  });
  it("unticked (default), or WhatsApp not connected: nothing is recorded", async () => {
    setup();
    await walkIn({ consentBy: "user-77" });
    expect(mocks.db.client.update.mock.calls.some((c: any) => c[0].data.whatsappConsent === true)).toBe(false);
    mocks.db.client.update.mockClear(); setup(false);
    await walkIn({ whatsappConsent: true, consentBy: "user-77" });
    expect(mocks.db.client.update.mock.calls.some((c: any) => c[0].data.whatsappConsent === true)).toBe(false);
  });
  it("other sources never carry a staff id; a number the walk-in could not claim records nothing", async () => {
    const tx = { client: { update: mocks.db.client.update } } as never;
    await recordWhatsAppConsent(tx, { id: "c1", phone: "+919876543210" }, "9876543210", "Asia/Kolkata", "booking_form", new Date(), "user-77");
    expect(mocks.db.client.update.mock.calls[0][0].data.whatsappConsentBy).toBeNull();
    mocks.db.client.update.mockClear();
    expect(await recordWhatsAppConsent(tx, { id: "c1", phone: "+911111111111" }, "9876543210", "Asia/Kolkata", "DESK", new Date(), "user-77")).toBe(false);
    expect(mocks.db.client.update).not.toHaveBeenCalled();
  });
});
