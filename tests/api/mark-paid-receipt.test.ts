import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { db, notify, session } = vi.hoisted(() => ({
  db: { findFirst: vi.fn(), update: vi.fn(), clientUpdate: vi.fn(), transaction: vi.fn() },
  notify: vi.fn(),
  session: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { appointment: { findFirst: db.findFirst, update: db.update }, client: { update: db.clientUpdate }, $transaction: db.transaction },
}));
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/onlinePayment", () => ({
  serviceLabel: (first: string, notes: string | null) => (notes?.startsWith("__services__:") ? `${first} & ${notes.replace("__services__:", "")}` : first),
}));

import { PATCH } from "@/app/api/appointments/[id]/payment/route";

const basic = { id: "cmgx1ab2c0000xyz1234", businessId: "b1", clientId: "c1", price: 500, paymentStatus: "unpaid", paymentMode: "postpaid" };
const full = {
  ...basic, date: new Date("2026-11-02T04:30:00Z"), duration: 30, notes: null, patientName: null, razorpayPaymentId: "pay_should_not_show",
  client: { name: "Riya Kapoor", email: "riya@x.test" }, service: { name: "Checkup" }, staff: { name: "Dr Rao" },
  business: { name: "Sunrise", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null },
};
const call = () => PATCH(new NextRequest("http://localhost/api/appointments/x/payment", { method: "PATCH" }), { params: Promise.resolve({ id: basic.id }) });

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { businessId: "b1" } });
  db.transaction.mockResolvedValue([{ ...basic, paymentStatus: "paid" }, {}]);
  db.findFirst.mockReset().mockResolvedValueOnce(basic).mockResolvedValueOnce(full);
  notify.mockReset().mockResolvedValue(undefined);
});

describe("manual mark-paid receipt", () => {
  it("queues one receipt for the customer, on the business and appointment", async () => {
    expect((await call()).status).toBe(200);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      event: "booking.paid", audience: "CUSTOMER", template: "invoice", subjectId: basic.id,
      recipient: "riya@x.test", businessId: "b1", appointmentId: basic.id,
    });
    expect(notify.mock.calls[0][0].version).toBeUndefined();
  });
  it("the receipt shows the business's local time and carries no Razorpay reference", async () => {
    await call();
    const { payload } = notify.mock.calls[0][0];
    expect(payload).toMatchObject({ invoiceNumber: "INV-XYZ1234".replace("XYZ1234", basic.id.slice(-8).toUpperCase()), price: 500, currency: "INR", staffName: "Dr Rao", time: "10:00 AM" });
    expect(JSON.stringify(payload)).not.toContain("pay_should_not_show");
  });
  it("lists every service of a multi-service booking", async () => {
    db.findFirst.mockReset().mockResolvedValueOnce(basic).mockResolvedValueOnce({ ...full, notes: "__services__:Xray" });
    await call();
    expect(notify.mock.calls[0][0].payload.serviceName).toBe("Checkup & Xray");
  });
  it("looks the booking up inside the session's business", async () => {
    await call();
    for (const [arg] of db.findFirst.mock.calls) expect(arg.where).toEqual({ id: basic.id, businessId: "b1" });
  });
  it("no email on file: still paid, nothing queued", async () => {
    db.findFirst.mockReset().mockResolvedValueOnce(basic).mockResolvedValueOnce({ ...full, client: { name: "R", email: null } });
    expect((await call()).status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });
  it("a failed enqueue does not undo the payment", async () => {
    notify.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).appointment.paymentStatus).toBe("paid");
  });
  it("already paid: 400 and no second receipt", async () => {
    db.findFirst.mockReset().mockResolvedValueOnce({ ...basic, paymentStatus: "paid" });
    expect((await call()).status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });
  it("another business's booking: 404 and no receipt", async () => {
    db.findFirst.mockReset().mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
    expect(notify).not.toHaveBeenCalled();
  });
});
