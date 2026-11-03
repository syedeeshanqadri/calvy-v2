import { describe, it, expect, vi, beforeEach } from "vitest";

// step-3/customer-events: the online-payment (Cashfree) path. Confirmation plus a receipt for what was actually
// paid, once per payment, and a webhook retry sends nothing new. Razorpay is a separate path and not touched.

const mocks = vi.hoisted(() => {
  const db: Record<string, any> = {
    appointment: { findUnique: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn() },
    client: { update: vi.fn() },
    platformFeeEntry: { create: vi.fn() },
    $executeRaw: vi.fn(async () => 0),
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return { db, notify: vi.fn(async (..._items: unknown[]) => {}), push: vi.fn(async (..._a: unknown[]) => {}), whatsapp: vi.fn(async (..._a: unknown[]) => {}) };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: mocks.notify }));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: mocks.push }));
vi.mock("@/lib/whatsapp", () => ({ sendBookingConfirmationWhatsApp: mocks.whatsapp }));
// Owner alerts: a tagged stand-in, so the tests can tell them from the customer's messages.
vi.mock("@/lib/notifications/business", () => ({
  ownerAlert: vi.fn(async (_n: unknown, kind: string, d: { version?: string; price?: number } = {}) => ({ event: `alert.booking.${kind}`, version: d.version, payload: { price: d.price } })),
}));

import { sendConfirmationFor, settlePaidPayment } from "@/lib/onlinePayment";

const booking = (over: Record<string, unknown> = {}) => ({
  id: "cmgx1ab2c0000xyz1234", businessId: "biz1", status: "confirmed", date: new Date("2026-11-02T04:30:00Z"), duration: 30, price: 500, notes: null,
  patientName: null, isOnline: false, meetingUrl: null, tokenNumber: null, estimatedAt: null, tokenSession: null,
  client: { name: "Riya Kapoor", email: "riya@example.com", phone: null },
  service: { name: "Checkup", meetingUrl: null }, staff: { name: "Dr Rao", meetingUrl: null },
  business: { name: "Sunrise", slug: "sunrise", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null },
  ...over,
});
type Queued = { event: string; template: string; version?: string | number; payload: Record<string, any> } | null;
const isAlert = (q: unknown) => (q as Queued)?.event?.startsWith("alert.") ?? false;
/** What the customer is sent (calls made only of owner alerts are left out). */
const sent = () => mocks.notify.mock.calls.filter((c) => !c.every((q) => q === null || isAlert(q))).flatMap((c) => c) as Queued[];
const alerts = () => (mocks.notify.mock.calls.flat() as Queued[]).filter(isAlert);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.appointment.findUnique.mockResolvedValue(booking());
});

describe("sendConfirmationFor", () => {
  it("a booking paid at the venue: the confirmation only, no receipt", async () => {
    await sendConfirmationFor("a1");
    const [first, second] = sent();
    expect(first).toMatchObject({ event: "booking.created", template: "confirmation", payload: { businessName: "Sunrise", serviceName: "Checkup", ics: { appointmentId: "cmgx1ab2c0000xyz1234" } } });
    expect(second).toBeNull();
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("paid in full online: a confirmation and a receipt for exactly what was paid", async () => {
    await sendConfirmationFor("a1", { paid: true, payment: { id: "pay1", amountMinor: 50000, ref: "cf_pay_1" } });
    const [confirmation, receipt] = sent();
    expect(confirmation?.event).toBe("booking.created");
    expect(receipt).toMatchObject({ event: "booking.paid", template: "invoice", version: "pay1", payload: { price: 500, serviceName: "Checkup", paymentRef: "cf_pay_1" } });
  });

  it("a booking fee is not the price of the service: the receipt says so and shows the fee", async () => {
    await sendConfirmationFor("a1", { paid: true, payment: { id: "pay1", amountMinor: 5000 } });
    expect(sent()[1]).toMatchObject({ payload: { price: 50, serviceName: "Checkup (online payment)" } });
  });

  it("the flood-protection case: the business hears about it, the contact gets nothing", async () => {
    await sendConfirmationFor("a1", { paid: true, contactMessages: false, payment: { id: "pay1", amountMinor: 50000 } });
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual([]);
    expect(alerts().map((a) => a?.event)).toEqual(["alert.booking.created", "alert.booking.paid"]);
    expect(mocks.whatsapp).not.toHaveBeenCalled();
  });

  it("a token booking's confirmation carries the number and session", async () => {
    mocks.db.appointment.findUnique.mockResolvedValue(booking({ tokenNumber: 7, tokenSession: { name: "Morning" }, estimatedAt: new Date("2026-11-02T05:10:00Z") }));
    await sendConfirmationFor("a1");
    expect(sent()[0]?.payload.token).toEqual({ number: 7, sessionName: "Morning", estimatedTime: "10:40 AM" });
  });

  it("a failed enqueue never throws out of the booking flow", async () => {
    mocks.notify.mockRejectedValueOnce(new Error("db down"));
    await expect(sendConfirmationFor("a1")).resolves.toBeUndefined();
  });
});

describe("settlePaidPayment", () => {
  const payment = { id: "pay1", appointmentId: "a1", businessId: "biz1", status: "PAID", amountMinor: 50000, platformFeeMinor: 0, paymentRef: "cf_pay_1" };
  const held = (status: string) => ({ id: "a1", status, holdExpiresAt: status === "pending_payment" ? new Date(Date.now() + 600_000) : null, clientId: "c1", date: new Date("2026-11-02T04:30:00Z") });

  it("confirming a held booking queues the confirmation and the receipt once", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(payment);
    mocks.db.appointment.findUnique.mockResolvedValueOnce(held("pending_payment")).mockResolvedValue(booking());
    expect(await settlePaidPayment("pay1")).toBe("confirmed");
    expect(sent().map((n) => n?.event)).toEqual(["booking.created", "booking.paid"]);
    expect(sent()[1]).toMatchObject({ version: "pay1", payload: { paymentRef: "cf_pay_1", price: 500 } });
    // The business: a new-booking alert and a payment alert keyed on the same payment.
    expect(alerts()).toMatchObject([{ event: "alert.booking.created" }, { event: "alert.booking.paid", version: "pay1", payload: { price: 500 } }]);
  });

  it("the gateway calling again (webhook retry, return page) queues nothing more", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(payment);
    mocks.db.appointment.findUnique.mockResolvedValue(held("confirmed"));
    expect(await settlePaidPayment("pay1")).toBe("noop");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
