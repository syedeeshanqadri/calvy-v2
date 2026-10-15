import { describe, it, expect } from "vitest";
import { settingsPatchSchema } from "@/lib/validation/settings";

const day = { enabled: true, start: "09:00", end: "17:00" };
const avail = (o: unknown) => JSON.stringify(o);

describe("settingsPatchSchema", () => {
  it("accepts a valid patch and trims strings", () => {
    const r = settingsPatchSchema.parse({
      name: "  Studio  ",
      currency: "USD",
      primaryColor: "#0284c7",
      slotInterval: 30,
      availabilityJson: avail({ "1": day, "0": { enabled: false, start: "09:00", end: "09:00" } }),
    });
    expect(r.name).toBe("Studio");
  });
  it("coerces numeric-string slotInterval", () => {
    expect(settingsPatchSchema.parse({ slotInterval: "15" }).slotInterval).toBe(15);
  });
  it.each([0, 4, 241, 1.5, -10, "abc"])("rejects slotInterval %s", (v) => {
    expect(settingsPatchSchema.safeParse({ slotInterval: v }).success).toBe(false);
  });
  it.each(["usd", "US", "USDD", "12A", ""])("rejects currency %s", (v) => {
    expect(settingsPatchSchema.safeParse({ currency: v }).success).toBe(false);
  });
  it.each(["#fff", "#FFAA00"])("accepts colour %s", (v) => {
    expect(settingsPatchSchema.safeParse({ primaryColor: v }).success).toBe(true);
  });
  it.each(["red", "#ff", "#ggg", "0284c7", "#12345"])("rejects colour %s", (v) => {
    expect(settingsPatchSchema.safeParse({ primaryColor: v }).success).toBe(false);
  });
  it("rejects bad availabilityJson", () => {
    const bad = [
      "not json",
      "[]",
      "null",
      avail({ "7": day }),
      avail({ "1": { ...day, start: "9am" } }),
      avail({ "1": { ...day, end: "08:00" } }),
      avail({ "1": { enabled: "yes", start: "09:00", end: "10:00" } }),
    ];
    for (const b of bad) expect(settingsPatchSchema.safeParse({ availabilityJson: b }).success).toBe(false);
  });
  it("accepts empty availability object", () => {
    expect(settingsPatchSchema.safeParse({ availabilityJson: "{}" }).success).toBe(true);
  });
  it("caps string lengths", () => {
    expect(settingsPatchSchema.safeParse({ name: "a".repeat(121) }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ description: "a".repeat(2001) }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ name: "   " }).success).toBe(false);
  });
  it("strips keys outside the allow-list", () => {
    const r = settingsPatchSchema.parse({ name: "X", ownerId: "evil", plan: "business", id: "1" });
    expect(Object.keys(r)).toEqual(["name"]);
  });
});
