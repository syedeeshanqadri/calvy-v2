import { describe, expect, it } from "vitest";
import { ALL_PACKS, getPack, packForBusinessType, packSchema, PACK_IDS } from "@/lib/packs";
import { termsOverrideSchema } from "@/lib/packs/types";
import { t, terms } from "@/lib/terms";

describe("packs", () => {
  it("every pack passes the Zod schema and all five exist", () => {
    expect(ALL_PACKS.map((p) => p.id)).toEqual([...PACK_IDS]);
    for (const p of ALL_PACKS) expect(packSchema.safeParse(p).success).toBe(true);
  });
  it("rejects an invalid pack", () => {
    expect(packSchema.safeParse({ ...getPack("CLINIC"), defaultBookingMode: "QUEUE" }).success).toBe(false);
    expect(packSchema.safeParse({ ...getPack("CLINIC"), terms: {} }).success).toBe(false);
  });
  it("maps legacy businessType like the migration", () => {
    expect(packForBusinessType("dental")).toBe("CLINIC");
    expect(packForBusinessType("barbershop")).toBe("SALON_SPA");
    expect(packForBusinessType("fitness")).toBe("FITNESS");
    expect(packForBusinessType("coach")).toBe("OTHER");
    expect(packForBusinessType(undefined)).toBe("OTHER");
  });
});

describe("t()", () => {
  it("falls back to OTHER for unknown/missing pack", () => {
    expect(t({}, "client")).toBe("client");
    expect(t({ packId: "NOPE" }, "staff")).toBe("staff");
  });
  it("uses the pack terms", () => {
    expect(t({ packId: "CLINIC" }, "client")).toBe("patient");
    expect(t({ packId: "FITNESS" }, "staff")).toBe("trainer");
  });
  it("pluralises and capitalises", () => {
    expect(t({ packId: "CLINIC" }, "client", { plural: true })).toBe("patients");
    expect(t({ packId: "CLINIC" }, "client", { cap: true })).toBe("Patient");
    expect(t({ packId: "OTHER" }, "business", { plural: true, cap: true })).toBe("Businesses");
    expect(t({ packId: "OTHER" }, "staff", { plural: true })).toBe("staff");
  });
  it("override wins, partial override keeps the rest of the pack", () => {
    const b = { packId: "CLINIC", termsOverride: { client: { singular: "guest" } } };
    expect(t(b, "client")).toBe("guest");
    expect(t(b, "client", { plural: true })).toBe("guests");
    expect(t(b, "staff")).toBe("doctor");
    const c = { packId: "CLINIC", termsOverride: { client: { singular: "person", plural: "people" } } };
    expect(t(c, "client", { plural: true })).toBe("people");
  });
  it("ignores an invalid override", () => {
    expect(t({ packId: "CLINIC", termsOverride: { client: "guest", bogus: 1 } }, "client")).toBe("patient");
    expect(t({ packId: "CLINIC", termsOverride: null }, "client")).toBe("patient");
  });
  it("terms() binds a source", () => {
    expect(terms({ packId: "LAWYER" })("appointment", { cap: true })).toBe("Meeting");
  });
  it("override schema is strict", () => {
    expect(termsOverrideSchema.safeParse({ client: { singular: "x" } }).success).toBe(true);
    expect(termsOverrideSchema.safeParse({ nope: {} }).success).toBe(false);
    expect(termsOverrideSchema.safeParse({ client: { singular: "" } }).success).toBe(false);
  });
});
