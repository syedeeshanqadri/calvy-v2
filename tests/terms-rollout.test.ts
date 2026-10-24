import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { createElement } from "react";
import {
  BookingCancellationEmail, BookingConfirmationEmail, BookingReminderEmail, BookingRescheduleEmail, type BookingProps,
} from "@/emails/templates";
import { PACK_IDS, getPack, packForBusinessType } from "@/lib/packs";
import { providerWord, staffRoleChoice, t } from "@/lib/terms";
import { defaultWebsiteConfig } from "@/lib/website";

const base: BookingProps = {
  clientName: "Riya Kapoor", businessName: "Acme", serviceName: "Thing", staffName: "Pat",
  date: "Mon, 26 Oct", time: "10:00 AM", duration: 30, price: 50, currency: "USD",
};
const text = async (el: React.ReactElement) => (await render(el, { plainText: true })).replace(/\s+/g, " ");

describe("emails use the pack wording", () => {
  const expected: Record<string, { appt: string; svc: string }> = {
    CLINIC: { appt: "appointment", svc: "Consultation" },
    SALON_SPA: { appt: "appointment", svc: "Service" },
    LAWYER: { appt: "meeting", svc: "Consultation" },
    FITNESS: { appt: "booking", svc: "Session" },
    CONSULTANT: { appt: "session", svc: "Consultation" },
    OTHER: { appt: "appointment", svc: "Service" },
  };
  for (const id of PACK_IDS) {
    it(`${id}: confirmation, reminder, cancellation, reschedule`, async () => {
      const p = { ...base, terms: { packId: id } };
      const { appt, svc } = expected[id];
      expect(await text(createElement(BookingConfirmationEmail, p))).toContain(`your ${appt} at Acme is confirmed`);
      expect(await text(createElement(BookingConfirmationEmail, p))).toContain(`${svc}Thing`);
      expect(await text(createElement(BookingReminderEmail, p))).toContain(`Your ${appt} is tomorrow`);
      expect(await text(createElement(BookingCancellationEmail, p))).toContain(`Your ${appt} was cancelled`);
      expect(await text(createElement(BookingRescheduleEmail, { ...p, oldDate: "Sun", oldTime: "9:00 AM" }))).toContain(`Your ${appt} has moved`);
    });
  }
  it("a termsOverride wins over the pack", async () => {
    const p = { ...base, terms: { packId: "CLINIC", termsOverride: { appointment: { singular: "visit" } } } };
    expect(await text(createElement(BookingReminderEmail, p))).toContain("Your visit is tomorrow");
  });
  it("no terms falls back to the OTHER pack", async () => {
    expect(await text(createElement(BookingReminderEmail, base))).toContain("Your appointment is tomorrow");
  });
});

describe("default website copy follows the pack", () => {
  it("lawyer site says meeting/consultations, fitness says bookings/members", () => {
    const law = defaultWebsiteConfig("Sharma", "lawyer", { packId: "LAWYER" });
    expect(law.hero.subheadline).toContain("meeting");
    expect(law.services.title).toBe("Our Consultations");
    const fit = defaultWebsiteConfig("FitZone", "fitness", { packId: "FITNESS" });
    expect(fit.about.trustLabel).toBe("Trusted by members");
    expect(fit.services.title).toBe("Our Sessions");
  });
  it("no pack keeps the old generic wording", () => {
    expect(defaultWebsiteConfig("X", "general").services.title).toBe("Our Services");
  });
});

describe("pack extras", () => {
  it("every pack has role options and service placeholders", () => {
    for (const id of PACK_IDS) {
      const p = getPack(id);
      expect(p.staffRoles.length).toBeGreaterThanOrEqual(3);
      expect(p.placeholders.serviceName.startsWith("e.g. ")).toBe(true);
    }
    expect(getPack("CLINIC").staffRoles).toEqual(["Doctor", "Dentist", "Physiotherapist", "Psychologist"]);
    expect(getPack("OTHER").placeholders.serviceName).toBe("e.g. Standard Appointment");
  });
  it("staff role dropdown: listed role, unknown role shown as Other, blank defaults to first", () => {
    expect(staffRoleChoice({ packId: "CLINIC" }, "Dentist")).toEqual({ select: "Dentist", other: "" });
    expect(staffRoleChoice({ packId: "CLINIC" }, "Receptionist")).toEqual({ select: "Other", other: "Receptionist" });
    for (const id of PACK_IDS) expect(getPack(id).staffRoles).not.toContain("Receptionist");
    expect(staffRoleChoice({ packId: "CLINIC" }, "Senior Stylist")).toEqual({ select: "Other", other: "Senior Stylist" });
    expect(staffRoleChoice({ packId: "SALON_SPA" }, "")).toEqual({ select: "Stylist", other: "" });
  });
  it("nav/form words resolve per pack", () => {
    expect(t({ packId: "CLINIC" }, "client", { plural: true, cap: true })).toBe("Patients");
    expect(t({ packId: "CLINIC" }, "staff", { plural: true, cap: true })).toBe("Doctors");
    expect(t({ packId: "LAWYER" }, "appointment", { plural: true, cap: true })).toBe("Meetings");
  });
});

describe("providerWord (public booking page)", () => {
  it("uses the shared specific role", () => {
    expect(providerWord(["Doctor", "doctor"], "doctor")).toBe("doctor");
    expect(providerWord(["Senior Advocate"], "advocate")).toBe("senior advocate");
  });
  it("falls back to the pack word for mixed or generic roles", () => {
    expect(providerWord(["Doctor", "Dentist"], "doctor")).toBe("doctor");
    expect(providerWord(["Owner"], "stylist")).toBe("stylist");
    expect(providerWord(["Receptionist", "Receptionist"], "advocate")).toBe("advocate");
    expect(providerWord([], "trainer")).toBe("trainer");
  });
});

describe("Individual Consultant pack", () => {
  it("is selectable, maps from the legacy type, and has solo-expert wording and roles", () => {
    expect(PACK_IDS).toContain("CONSULTANT");
    expect(getPack("CONSULTANT").label).toBe("Individual Consultant");
    expect(packForBusinessType("consultant")).toBe("CONSULTANT");
    expect(packForBusinessType("coach")).toBe("OTHER"); // unchanged: mirrors the original backfill
    expect(getPack("CONSULTANT").staffRoles).toEqual(["Consultant", "Coach", "Advisor", "Counsellor"]);
    expect(t({ packId: "CONSULTANT" }, "appointment", { plural: true })).toBe("sessions");
    expect(t({ packId: "CONSULTANT" }, "staff", { cap: true })).toBe("Consultant");
  });
});
