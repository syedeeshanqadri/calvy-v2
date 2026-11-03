import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "fs";
import { render } from "@react-email/render";
import {
  meetingUrlSchema, meetingUrlOrEmpty, resolveBookingMode, resolveMeetingUrl, meetingUrlFor, offersOnline, onlineBadge, telemedicineNote,
} from "@/lib/online";
import { bookingSchema } from "@/lib/validation/bookings";
import { staffCreateSchema, staffPatchSchema, serviceCreateSchema, servicePatchSchema } from "@/lib/validation/dashboard";
import { BookingConfirmationEmail, BookingReminderEmail, type BookingProps } from "@/emails/templates";

// step-7/online-consults: service mode, meeting-link validation and resolution, and who can see the link.

const rows = vi.hoisted(() => ({ appt: null as unknown }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findUnique: vi.fn(async () => rows.appt), findMany: vi.fn(async () => []) },
    customerCredit: { findFirst: vi.fn(async () => null) },
  },
}));

describe("meeting link validation", () => {
  it("accepts https links from any provider", () => {
    for (const u of ["https://meet.google.com/abc-defg-hij", "https://us02web.zoom.us/j/123?pwd=x", "https://teams.microsoft.com/l/meetup-join/abc", "  https://example.com/room  "]) {
      expect(meetingUrlSchema.safeParse(u).success).toBe(true);
    }
  });
  it("rejects scripts, plain http, other schemes, credentials and junk", () => {
    const tooLong = "https://" + "a".repeat(600) + ".com";
    for (const u of ["javascript:alert(1)", "http://meet.example.com/x", "ftp://x.com/a", "data:text/html,hi", "meet.google.com/abc", "https://user:pw@example.com/x", "https://localhost/x", "", "not a url", tooLong]) {
      expect(meetingUrlSchema.safeParse(u).success, u).toBe(false);
    }
  });
  it("an empty value is allowed on optional fields (it clears the link)", () => {
    expect(meetingUrlOrEmpty.safeParse("").success).toBe(true);
    expect(meetingUrlOrEmpty.safeParse("http://x.com").success).toBe(false);
  });
  it("staff and service forms enforce it", () => {
    const staff = { name: "Dr Rao", role: "Doctor", email: "rao@example.com" };
    expect(staffCreateSchema.safeParse({ ...staff, meetingUrl: "https://meet.google.com/a-b-c" }).success).toBe(true);
    expect(staffCreateSchema.safeParse({ ...staff, meetingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(staffCreateSchema.safeParse({ ...staff, meetingUrl: "" }).success).toBe(true);
    expect(staffPatchSchema.safeParse({ meetingUrl: "http://insecure.example" }).success).toBe(false);
    expect(staffPatchSchema.safeParse({ meetingUrl: "" }).success).toBe(true);
    const svc = { name: "Video visit", duration: 20, price: 500 };
    expect(serviceCreateSchema.safeParse({ ...svc, mode: "ONLINE", meetingUrl: "https://zoom.us/j/1" }).success).toBe(true);
    expect(serviceCreateSchema.safeParse({ ...svc, mode: "BOTH", meetingUrl: "javascript:x" }).success).toBe(false);
    expect(serviceCreateSchema.safeParse({ ...svc, mode: "REMOTE" }).success).toBe(false);
    expect(servicePatchSchema.safeParse({ mode: "BOTH" }).success).toBe(true);
    expect(servicePatchSchema.safeParse({ mode: "nope" }).success).toBe(false);
  });
});

describe("booking mode selection", () => {
  it("IN_PERSON is never online and refuses an online request", () => {
    expect(resolveBookingMode({ mode: "IN_PERSON" }, undefined)).toEqual({ ok: true, isOnline: false });
    expect(resolveBookingMode({ mode: "IN_PERSON" }, "in_person")).toEqual({ ok: true, isOnline: false });
    expect(resolveBookingMode({ mode: "IN_PERSON" }, "online").ok).toBe(false);
    expect(resolveBookingMode({}, undefined)).toEqual({ ok: true, isOnline: false });
  });
  it("ONLINE is always online and refuses an in-person request", () => {
    expect(resolveBookingMode({ mode: "ONLINE" }, undefined)).toEqual({ ok: true, isOnline: true });
    expect(resolveBookingMode({ mode: "ONLINE" }, "online")).toEqual({ ok: true, isOnline: true });
    expect(resolveBookingMode({ mode: "ONLINE" }, "in_person").ok).toBe(false);
  });
  it("BOTH needs the customer's choice", () => {
    expect(resolveBookingMode({ mode: "BOTH" }, undefined).ok).toBe(false);
    expect(resolveBookingMode({ mode: "BOTH" }, "online")).toEqual({ ok: true, isOnline: true });
    expect(resolveBookingMode({ mode: "BOTH" }, "in_person")).toEqual({ ok: true, isOnline: false });
  });
  it("the booking body only accepts the two modes", () => {
    const base = { businessSlug: "s", serviceId: "svc1", date: "2026-11-02", time: "10:00", clientName: "A", clientEmail: "a@example.com" };
    expect(bookingSchema.safeParse({ ...base, mode: "online" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, mode: "" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, mode: "zoom" }).success).toBe(false);
  });
  it("badges name only services that are online", () => {
    expect([offersOnline({ mode: "IN_PERSON" }), offersOnline({ mode: "ONLINE" }), offersOnline({ mode: "BOTH" }), offersOnline({})]).toEqual([false, true, true, false]);
    expect([onlineBadge({ mode: "IN_PERSON" }), onlineBadge({ mode: "ONLINE" }), onlineBadge({ mode: "BOTH" })]).toEqual(["", "Online", "Online or in person"]);
  });
});

describe("which link applies", () => {
  it("service override beats the staff member's default; blank falls through", () => {
    expect(resolveMeetingUrl({ meetingUrl: "https://s.example/1" }, { meetingUrl: "https://t.example/2" })).toBe("https://s.example/1");
    expect(resolveMeetingUrl({ meetingUrl: null }, { meetingUrl: "https://t.example/2" })).toBe("https://t.example/2");
    expect(resolveMeetingUrl({ meetingUrl: "  " }, { meetingUrl: "https://t.example/2" })).toBe("https://t.example/2");
    expect(resolveMeetingUrl({ meetingUrl: null }, null)).toBeNull();
  });
  it("an in-person appointment has no link even when the staff member has one", () => {
    const staff = { meetingUrl: "https://t.example/2" };
    expect(meetingUrlFor({ isOnline: false, service: null, staff })).toBeNull();
    expect(meetingUrlFor({ isOnline: true, service: null, staff })).toBe("https://t.example/2");
  });
});

describe("who can see the link", () => {
  const base: BookingProps = {
    clientName: "Riya Kapoor", businessName: "Sunrise Clinic", serviceName: "Video visit", staffName: "Dr. Rao",
    date: "Mon, 26 Oct", time: "10:00 AM", duration: 20, price: 500, currency: "INR", terms: { packId: "CLINIC" },
  };
  const link = "https://meet.google.com/abc-defg-hij";

  it("confirmation and reminder emails to the booker carry the link for online bookings", async () => {
    for (const C of [BookingConfirmationEmail, BookingReminderEmail]) {
      const out = await render(createElement(C, { ...base, online: { meetingUrl: link } }));
      expect(out).toContain(link);
      expect(out).toContain("Join the consultation");
    }
  });
  it("online booking without a link says it will follow; in person never mentions it", async () => {
    const pending = await render(createElement(BookingConfirmationEmail, { ...base, online: { meetingUrl: null } }));
    expect(pending).toContain("joining link");
    expect(pending).not.toContain("https://meet.google.com");
    const inPerson = await render(createElement(BookingConfirmationEmail, base));
    expect(inPerson).not.toContain("Join the consultation");
    expect(inPerson).not.toContain("Online consultation");
  });
  it("the public booking and website code never reads the meeting link", () => {
    for (const f of ["app/b/[slug]/page.tsx", "app/[slug]/book-now/page.tsx", "app/[slug]/page.tsx", "app/api/availability/route.ts", "app/api/token-availability/route.ts", "lib/availability.ts", "lib/website.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toContain("meetingUrl");
    }
  });
  it("only the confirmation in lib/email is given the link (reminders come from the outbox)", () => {
    const src = readFileSync("lib/email.tsx", "utf8");
    const passes = src.split("\n").filter((l) => l.includes("online: d.online") || l.includes("online={d.online}"));
    expect(passes.length).toBe(1);
    expect(src).not.toMatch(/BookingCancellationEmail[^\n]*online/);
    expect(src).not.toMatch(/BookingRescheduleEmail[^\n]*online/);
  });
});

describe("tracking page (signed code) shows the link only for online bookings", () => {
  const make = (isOnline: boolean) => ({
    id: "cmgx1ab2c0000xyz1234", status: "confirmed", tokenNumber: 3, queuePosition: 1, queueState: null, notPresentCount: 0, carriedFromId: null,
    estimatedAt: new Date("2026-11-02T05:00:00Z"), sessionDate: new Date("2026-11-02T00:00:00Z"), tokenSessionId: "ts1", isOnline,
    service: { meetingUrl: null }, staff: { meetingUrl: "https://meet.google.com/abc-defg-hij" },
    business: { name: "Sunrise", slug: "sunrise", logoUrl: null, primaryColor: "#0f766e", packId: "CLINIC", termsOverride: null, timezone: "Asia/Kolkata" },
    tokenSession: { name: "Morning", startMin: 540, endMin: 720, minutesPerToken: 10, staff: { name: "Dr Rao" } },
    carriedTo: null,
  });

  it("valid code + online booking gets the link; in person gets none; a forged code gets nothing", async () => {
    process.env.TRACKING_SECRET = "test-secret-1";
    const { signTrackingCode } = await import("@/lib/tracking");
    const { loadTracking } = await import("@/lib/trackingDb");
    const code = signTrackingCode("cmgx1ab2c0000xyz1234")!;
    rows.appt = make(true);
    expect((await loadTracking(code))?.online).toEqual({ meetingUrl: "https://meet.google.com/abc-defg-hij" });
    rows.appt = make(false);
    expect((await loadTracking(code))?.online).toBeNull();
    rows.appt = make(true);
    expect(await loadTracking("cmgx1ab2c0000xyz1234.forged")).toBeNull();
    // Unpaid hold and cancelled bookings never get it.
    rows.appt = { ...make(true), status: "pending_payment" };
    expect((await loadTracking(code))?.online).toBeNull();
    rows.appt = { ...make(true), status: "cancelled" };
    expect((await loadTracking(code))?.online).toBeNull();
  });
});

describe("clinic pack", () => {
  it("adds the telemedicine note for clinics only", () => {
    expect(telemedicineNote("CLINIC")).toMatch(/doctor/i);
    expect(telemedicineNote("SALON_SPA")).toBeNull();
    expect(telemedicineNote(undefined)).toBeNull();
  });
});
