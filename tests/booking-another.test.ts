import { describe, it, expect, beforeEach, vi } from "vitest";
import { bookingForLabel, countDistinctPatients, exceedsPeopleCap } from "@/lib/patients";
import { bookingSchema } from "@/lib/validation/bookings";
import {
  addMyBooking, confirmMyBooking, datesBookerHolds, loadBooker, loadMyBookings, saveAgain, saveBooker, sessionsBookerHolds, takeAgain,
} from "@/lib/bookAgain";

describe("fair-use cap on different people", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  const row = (name: string, status = "confirmed") => ({ patientName: name, clientName: "Riya", status });
  it("counts different people, not bookings, and compares names loosely", () => {
    expect(countDistinctPatients([row("Riya"), row("riya "), row("Meena")], now)).toBe(2);
  });
  it("cancelled bookings and lapsed holds do not count", () => {
    const lapsed = { ...row("Asha", "pending_payment"), holdExpiresAt: new Date(now.getTime() - 1) };
    expect(countDistinctPatients([row("Riya"), row("Meena", "cancelled"), lapsed], now)).toBe(1);
  });
  it("a new person over the cap is refused; under it, or an already counted person, is not", () => {
    const four = ["A", "B", "C", "D"].map((n) => row(n));
    expect(exceedsPeopleCap("E", four, 4, now)).toBe(true);
    expect(exceedsPeopleCap("E", four.slice(0, 3), 4, now)).toBe(false);
    expect(exceedsPeopleCap("a", four, 4, now)).toBe(false);
  });
});

describe("how a booking reads to staff", () => {
  it("shows the patient and who booked it, or just the name when they are the same", () => {
    expect(bookingForLabel({ patientName: "Meena Kapoor", client: { name: "Riya Kapoor" } })).toBe("Meena Kapoor (booked by Riya Kapoor)");
    expect(bookingForLabel({ patientName: "riya kapoor", client: { name: "Riya Kapoor" } })).toBe("riya kapoor");
    expect(bookingForLabel({ patientName: null, client: { name: "Riya Kapoor" } })).toBe("Riya Kapoor");
  });
});

describe("booking for someone else: details", () => {
  const base = { businessSlug: "x", serviceId: "s1", date: "2026-10-20", time: "10:00", clientName: "Jo", clientEmail: "jo@x.com" };
  it("accepts a relation, age and gender; rejects unknown ones", () => {
    expect(bookingSchema.safeParse({ ...base, patientName: "Meena", patientRelation: "parent", patientAge: "63", patientGender: "female" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, patientName: "Meena", patientRelation: "boss" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...base, patientName: "Meena", patientAge: 200 }).success).toBe(false);
  });
  it("blank optional fields are fine", () => {
    expect(bookingSchema.safeParse({ ...base, patientName: "Meena", patientRelation: "", patientAge: "", patientGender: "" }).success).toBe(true);
  });
});

describe("book another: prefill through sessionStorage and booked dates", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("the choice and the booker's details survive to the next page, once", () => {
    saveBooker("x", { name: "Riya", email: "r@x.com", phone: "99" });
    saveAgain("x", { mode: "other", serviceIds: ["s1"], staffId: "st1", date: "2026-10-27" });
    expect(loadBooker("x")).toEqual({ name: "Riya", email: "r@x.com", phone: "99" });
    expect(takeAgain("x")).toEqual({ mode: "other", serviceIds: ["s1"], staffId: "st1", date: "2026-10-27" });
    expect(takeAgain("x")).toBeNull();
  });
  it("is empty, not an error, when storage is blocked", () => {
    const blocked = () => { throw new Error("blocked"); };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(loadBooker("x")).toBeNull();
    expect(takeAgain("x")).toBeNull();
    expect(() => saveAgain("x", { mode: "same", serviceIds: [], staffId: null, date: "" })).not.toThrow();
  });
  it("nothing from one business leaks into another", () => {
    saveBooker("x", { name: "Riya", email: "r@x.com", phone: "" });
    expect(loadBooker("y")).toBeNull();
  });

  const mine = [
    { date: "2026-10-27", patient: "Riya Kapoor", label: "10:30", confirmed: true },
    { date: "2026-10-28", patient: "Meena Kapoor", label: "11:00", confirmed: true },
    { date: "2026-10-29", patient: "Riya Kapoor", label: "12:00", confirmed: false, orderId: "calvy_1" },
    { date: "2026-10-30", patient: "Riya Kapoor", label: "Token #5", confirmed: true, tokenSessionId: "sess1" },
  ];
  it("myself, another date: dates I hold are disabled with the booking's label", () => {
    expect(datesBookerHolds(mine, "riya  kapoor")).toEqual({ "2026-10-27": "10:30" });
  });
  it("a booking for someone else does not block my own date; an unpaid one does not block yet", () => {
    const held = datesBookerHolds(mine, "Riya Kapoor");
    expect(held["2026-10-28"]).toBeUndefined();
    expect(held["2026-10-29"]).toBeUndefined();
  });
  it("a payment that goes through blocks the date from then on", () => {
    addMyBooking("x", { date: "2026-10-29", patient: "Riya Kapoor", label: "12:00", confirmed: false, orderId: "calvy_1" });
    expect(datesBookerHolds(loadMyBookings("x"), "Riya Kapoor")).toEqual({});
    expect(confirmMyBooking("x", "calvy_1")?.patient).toBe("Riya Kapoor");
    expect(datesBookerHolds(loadMyBookings("x"), "Riya Kapoor")).toEqual({ "2026-10-29": "12:00" });
  });
  it("tokens: only the session I hold on that date is disabled", () => {
    expect(sessionsBookerHolds(mine, "Riya Kapoor", "2026-10-30")).toEqual({ sess1: "Token #5" });
    expect(sessionsBookerHolds(mine, "Riya Kapoor", "2026-10-31")).toEqual({});
    expect(datesBookerHolds(mine, "Riya Kapoor")["2026-10-30"]).toBeUndefined();
  });
});
