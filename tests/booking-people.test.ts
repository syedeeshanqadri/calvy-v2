import { describe, it, expect } from "vitest";
import {
  contactRequirements, duplicatePatientMessage, findDuplicatePatient, missingContact, normalizeName, patientNameOf,
} from "@/lib/patients";
import { bookingSchema } from "@/lib/validation/bookings";

describe("contact requirements by country", () => {
  it("India (INR): email and phone are both required", () => {
    expect(contactRequirements("INR")).toEqual({ email: true, phone: true });
    expect(missingContact("INR", { email: "a@b.co", phone: "" })).toBe("A phone number is required.");
    expect(missingContact("INR", { email: "", phone: "9800000001" })).toBe("An email address is required.");
    expect(missingContact("INR", { email: "a@b.co", phone: "9800000001" })).toBeNull();
  });
  it("other countries: only email is required", () => {
    expect(contactRequirements("USD")).toEqual({ email: true, phone: false });
    expect(missingContact("USD", { email: "a@b.co", phone: "" })).toBeNull();
    expect(missingContact("GBP", { email: " ", phone: "123" })).toBe("An email address is required.");
  });
  it("an unknown currency is treated as international", () => {
    expect(contactRequirements(null).phone).toBe(false);
  });
});

describe("names compare loosely", () => {
  it("ignores case, spacing, punctuation and accents", () => {
    expect(normalizeName("  Riya   KAPOOR ")).toBe("riya kapoor");
    expect(normalizeName("Riya-Kapoor.")).toBe("riya kapoor");
    expect(normalizeName("José Núñez")).toBe("jose nunez");
  });
  it("keeps non-Latin names", () => {
    expect(normalizeName("प्रिया मेनन")).toBe("प्रिया मेनन");
  });
});

describe("the person an appointment is for", () => {
  it("uses the patient name, else the contact's name (older bookings)", () => {
    expect(patientNameOf({ patientName: "Meena", client: { name: "Riya" } })).toBe("Meena");
    expect(patientNameOf({ patientName: null, client: { name: "Riya" } })).toBe("Riya");
    expect(patientNameOf({ patientName: "  ", client: { name: "Riya" } })).toBe("Riya");
  });
});

describe("duplicate patient on the same day", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  const live = new Date(now.getTime() + 10 * 60_000);
  const lapsed = new Date(now.getTime() - 60_000);
  const booked = [{ patientName: "Riya Kapoor", clientName: "Riya Kapoor", status: "confirmed" }];

  it("the same person again is a duplicate", () => {
    expect(findDuplicatePatient("riya  kapoor", booked, now)).toBe(booked[0]);
  });
  it("a different name (booking for someone else) is fine", () => {
    expect(findDuplicatePatient("Meena Kapoor", booked, now)).toBeNull();
  });
  it("an older booking with no patient name matches on the contact's name", () => {
    expect(findDuplicatePatient("Riya Kapoor", [{ patientName: null, clientName: "Riya Kapoor", status: "confirmed" }], now)).not.toBeNull();
  });
  it("cancelled, missed, expired and finished bookings do not block", () => {
    for (const status of ["cancelled", "no-show", "expired", "completed"]) {
      expect(findDuplicatePatient("Riya Kapoor", [{ ...booked[0], status }], now)).toBeNull();
    }
  });
  it("a pending payment blocks only while its hold is live", () => {
    expect(findDuplicatePatient("Riya Kapoor", [{ ...booked[0], status: "pending_payment", holdExpiresAt: live }], now)).not.toBeNull();
    expect(findDuplicatePatient("Riya Kapoor", [{ ...booked[0], status: "pending_payment", holdExpiresAt: lapsed }], now)).toBeNull();
  });
  it("an empty name never matches", () => {
    expect(findDuplicatePatient("   ", booked, now)).toBeNull();
  });
  it("tells the customer to add a different name", () => {
    expect(duplicatePatientMessage("Riya Kapoor", "Monday, October 26")).toBe(
      "Riya Kapoor already has an appointment on Monday, October 26. To book for someone else, enter their name.",
    );
  });
});

describe("booking input", () => {
  const base = { businessSlug: "x", serviceIds: ["s1"], date: "2026-10-26", time: "10:00", clientName: "Riya", clientEmail: "r@example.com" };
  it("accepts an optional patient name and treats blank as absent", () => {
    expect(bookingSchema.safeParse({ ...base, patientName: "Meena" }).data?.patientName).toBe("Meena");
    expect(bookingSchema.safeParse({ ...base, patientName: "" }).data?.patientName).toBeUndefined();
    expect(bookingSchema.safeParse(base).success).toBe(true);
  });
});
