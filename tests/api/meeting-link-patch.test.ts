import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { render } from "@react-email/render";
import { meetingUrlFor } from "@/lib/online";
import { appointmentPatchSchema } from "@/lib/validation/appointments";
import { MeetingLinkEmail } from "@/emails/templates";

// step-7/online-consults: staff add the link while editing an appointment; the customer is emailed.

const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  appointment: { findFirst: vi.fn(), update: vi.fn() },
  payment: { findFirst: vi.fn() },
}));
const notify = vi.hoisted(() => vi.fn(async (..._items: unknown[]) => {}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { businessId: "biz1" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/onlinePayment", () => ({ refundPayment: vi.fn() }));

import { PATCH } from "@/app/api/appointments/[id]/route";

const LINK = "https://meet.google.com/abc-defg-hij";
const row = (over: Record<string, unknown> = {}) => ({
  id: "a1", businessId: "biz1", status: "confirmed", paymentStatus: "unpaid", isOnline: true, meetingUrl: null,
  serviceId: "s1", staffId: "st1", date: new Date("2026-11-02T05:00:00Z"), duration: 20, price: 500, patientName: null,
  service: { meetingUrl: null, name: "Video visit" }, staff: { meetingUrl: null, name: "Dr Rao" },
  client: { name: "Riya Kapoor", email: "riya@example.com" },
  business: { name: "Sunrise", slug: "sunrise", currency: "INR", packId: "CLINIC", termsOverride: null },
  ...over,
});
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/appointments/a1", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: "a1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.business.findUnique.mockResolvedValue({ timezone: "Asia/Kolkata" });
  db.payment.findFirst.mockResolvedValue(null);
});

describe("link set on the appointment", () => {
  it("beats the service and staff links, and only applies to online bookings", () => {
    const a = { isOnline: true, meetingUrl: "https://a.example/1", service: { meetingUrl: "https://s.example/2" }, staff: { meetingUrl: "https://t.example/3" } };
    expect(meetingUrlFor(a)).toBe("https://a.example/1");
    expect(meetingUrlFor({ ...a, meetingUrl: null })).toBe("https://s.example/2");
    expect(meetingUrlFor({ ...a, isOnline: false })).toBeNull();
  });
  it("must be an https link (empty clears it)", () => {
    expect(appointmentPatchSchema.safeParse({ meetingUrl: LINK }).success).toBe(true);
    expect(appointmentPatchSchema.safeParse({ meetingUrl: "" }).success).toBe(true);
    expect(appointmentPatchSchema.safeParse({ meetingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(appointmentPatchSchema.safeParse({ meetingUrl: "http://insecure.example/x" }).success).toBe(false);
  });
});

describe("PATCH /api/appointments/[id] with a meeting link", () => {
  it("saves it and emails the customer that a link was added", async () => {
    db.appointment.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ meetingUrl: LINK }));
    db.appointment.update.mockResolvedValue(row({ meetingUrl: LINK }));
    const res = await patch({ meetingUrl: LINK });
    expect(res.status).toBe(200);
    expect(db.appointment.update.mock.calls[0][0].data).toMatchObject({ meetingUrl: LINK });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ event: "booking.meeting_link", audience: "CUSTOMER", template: "meeting_link", subjectId: "a1", recipient: "riya@example.com", payload: { meetingUrl: LINK, updated: false } });
  });

  it("changing an existing link says it was updated", async () => {
    db.appointment.findFirst.mockResolvedValueOnce(row({ meetingUrl: "https://old.example/x" })).mockResolvedValueOnce(row({ meetingUrl: "https://old.example/x" })).mockResolvedValueOnce(row({ meetingUrl: LINK }));
    db.appointment.update.mockResolvedValue(row({ meetingUrl: LINK }));
    await patch({ meetingUrl: LINK });
    expect(notify.mock.calls[0][0]).toMatchObject({ payload: { meetingUrl: LINK, updated: true } });
  });

  it("saving the same link again sends nothing", async () => {
    db.appointment.findFirst.mockResolvedValue(row({ meetingUrl: LINK }));
    db.appointment.update.mockResolvedValue(row({ meetingUrl: LINK }));
    await patch({ meetingUrl: LINK });
    expect(notify).not.toHaveBeenCalled();
  });

  it("clearing the link emails nothing", async () => {
    db.appointment.findFirst.mockResolvedValueOnce(row({ meetingUrl: LINK })).mockResolvedValueOnce(row({ meetingUrl: LINK })).mockResolvedValueOnce(row());
    db.appointment.update.mockResolvedValue(row());
    const res = await patch({ meetingUrl: "" });
    expect(res.status).toBe(200);
    expect(db.appointment.update.mock.calls[0][0].data).toMatchObject({ meetingUrl: null });
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses a link on an in-person appointment and a non-https link", async () => {
    db.appointment.findFirst.mockResolvedValue(row({ isOnline: false }));
    expect((await patch({ meetingUrl: LINK })).status).toBe(400);
    expect((await patch({ meetingUrl: "javascript:alert(1)" })).status).toBe(400);
    expect(db.appointment.update).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not email for a cancelled booking", async () => {
    db.appointment.findFirst.mockResolvedValue(row({ status: "cancelled" }));
    db.appointment.update.mockResolvedValue(row({ status: "cancelled", meetingUrl: LINK }));
    await patch({ meetingUrl: LINK });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("the link email", () => {
  it("carries a join button for the new link", async () => {
    const base = { clientName: "Riya Kapoor", businessName: "Sunrise", serviceName: "Video visit", staffName: "Dr Rao", date: "Mon, 2 Nov", time: "10:30 AM", terms: { packId: "CLINIC" } };
    const added = await render(createElement(MeetingLinkEmail, { ...base, meetingUrl: LINK, updated: false }));
    expect(added).toContain(LINK);
    expect(added).toContain("joining link is ready");
    const updated = await render(createElement(MeetingLinkEmail, { ...base, meetingUrl: LINK, updated: true }));
    expect(updated).toContain("has changed");
  });
});
