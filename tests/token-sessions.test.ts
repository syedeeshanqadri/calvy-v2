import { describe, it, expect } from "vitest";
import {
  dayCapacity, describeSession, findOverlap, hhmmToMin, minToHhmm, sessionCapacity,
  sessionsOverlap, tokenSessionInputSchema, toSessionFields, type SessionLike,
} from "@/lib/tokens";
import { getPack } from "@/lib/packs";

const WEEK = [1, 2, 3, 4, 5];
const s = (o: Partial<SessionLike>): SessionLike => ({
  name: "S", staffId: null, weekdays: WEEK, startMin: 600, endMin: 840, minutesPerToken: 15, isActive: true, ...o,
});
const morning = s({ id: "m", name: "Morning" });
const evening = s({ id: "e", name: "Evening", startMin: 1020, endMin: 1200 });

describe("capacity maths", () => {
  it("floors (end - start) / minutes", () => {
    expect(sessionCapacity(morning)).toBe(16);
    expect(sessionCapacity(evening)).toBe(12);
    expect(sessionCapacity(s({ startMin: 600, endMin: 650, minutesPerToken: 15 }))).toBe(3);
  });
  it("is 0 for degenerate input", () => {
    expect(sessionCapacity(s({ endMin: 600 }))).toBe(0);
    expect(sessionCapacity(s({ minutesPerToken: 0 }))).toBe(0);
  });
  it("sums active sessions running on the weekday", () => {
    expect(dayCapacity([morning, evening], 1)).toBe(28);
    expect(dayCapacity([morning, evening], 0)).toBe(0);
    expect(dayCapacity([morning, { ...evening, isActive: false }], 1)).toBe(16);
  });
  it("counts each staff queue separately", () => {
    expect(dayCapacity([s({ staffId: "dr-a" }), s({ staffId: "dr-b" })], 2)).toBe(32);
  });
  it("describes a session", () => {
    expect(describeSession(morning)).toBe("Morning 10:00-14:00 @ 15 min = 16 appointments");
    expect(describeSession(s({ name: "One", startMin: 600, endMin: 615 }), "tokens")).toBe("One 10:00-10:15 @ 15 min = 1 token");
  });
  it("converts HH:MM", () => {
    expect(hhmmToMin("17:30")).toBe(1050);
    expect(minToHhmm(600)).toBe("10:00");
  });
});

describe("overlap rejection", () => {
  it("rejects intersecting ranges on a shared day in the same queue", () => {
    expect(sessionsOverlap(morning, s({ startMin: 780, endMin: 900 }))).toBe(true);
  });
  it("allows touching ranges", () => {
    expect(sessionsOverlap(morning, s({ startMin: 840, endMin: 900 }))).toBe(false);
  });
  it("allows the same hours on different weekdays", () => {
    expect(sessionsOverlap(morning, s({ weekdays: [0, 6] }))).toBe(false);
  });
  it("ignores inactive sessions", () => {
    expect(sessionsOverlap(morning, s({ isActive: false }))).toBe(false);
  });
  it("findOverlap skips the session being edited", () => {
    expect(findOverlap(morning, [morning, evening])).toBeNull();
    expect(findOverlap(s({ startMin: 1100, endMin: 1300 }), [morning, evening])?.id).toBe("e");
  });
});

describe("per-staff vs business-wide", () => {
  it("different staff members may run the same hours", () => {
    expect(sessionsOverlap(s({ staffId: "dr-a" }), s({ staffId: "dr-b" }))).toBe(false);
  });
  it("the same staff member may not", () => {
    expect(sessionsOverlap(s({ staffId: "dr-a" }), s({ staffId: "dr-a" }))).toBe(true);
  });
  it("two business-wide sessions clash", () => {
    expect(sessionsOverlap(s({}), s({}))).toBe(true);
  });
  it("business-wide and per-staff queues are separate", () => {
    expect(sessionsOverlap(s({ staffId: null }), s({ staffId: "dr-a" }))).toBe(false);
  });
});

describe("input schema", () => {
  const ok = { name: "Morning", staffId: null, weekdays: [3, 1, 1], startTime: "10:00", endTime: "14:00", minutesPerToken: 15 };
  it("accepts and normalises", () => {
    const f = toSessionFields(tokenSessionInputSchema.parse(ok));
    expect(f).toMatchObject({ weekdays: [1, 3], startMin: 600, endMin: 840, minutesPerToken: 15, isActive: true });
  });
  it("rejects end before start, no days, and a session shorter than one slot", () => {
    expect(tokenSessionInputSchema.safeParse({ ...ok, endTime: "09:00" }).success).toBe(false);
    expect(tokenSessionInputSchema.safeParse({ ...ok, weekdays: [] }).success).toBe(false);
    expect(tokenSessionInputSchema.safeParse({ ...ok, endTime: "10:10" }).success).toBe(false);
  });
});

describe("pack default booking mode", () => {
  it("Clinic is TOKEN, the others SLOT", () => {
    expect(getPack("CLINIC").defaultBookingMode).toBe("TOKEN");
    for (const id of ["SALON_SPA", "LAWYER", "FITNESS", "CONSULTANT", "OTHER"] as const) expect(getPack(id).defaultBookingMode).toBe("SLOT");
  });
});
