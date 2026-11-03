import { describe, expect, it } from "vitest";
import { ALL_PACKS, getPack, packForBusinessType, PACK_IDS } from "@/lib/packs";
import { applyPackDefaults, planPackServices, type PackApplyDb } from "@/lib/packs/apply";
import { defaultServiceSchema } from "@/lib/packs/types";
import { onboardingSchema, signupSchema } from "@/lib/validation/public";

describe("pack default services", () => {
  it("every pack has 1-3 valid, uniquely named defaults", () => {
    for (const p of ALL_PACKS) {
      expect(p.defaultServices.length).toBeGreaterThanOrEqual(1);
      expect(p.defaultServices.length).toBeLessThanOrEqual(3);
      for (const s of p.defaultServices) expect(defaultServiceSchema.safeParse(s).success).toBe(true);
      const names = p.defaultServices.map((s) => s.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it("each pack's canonical businessType maps back to the same pack", () => {
    for (const id of PACK_IDS) expect(packForBusinessType(getPack(id).businessType)).toBe(id);
  });
  it("defaults fit the Free plan's 3 services", () => {
    for (const p of ALL_PACKS) expect(p.defaultServices.length).toBeLessThanOrEqual(3);
  });
});

describe("planPackServices", () => {
  it("creates everything on an empty business", () => {
    const r = planPackServices("CLINIC", [], Infinity);
    expect(r.toCreate).toHaveLength(3);
    expect(r.skippedExisting).toEqual([]);
  });
  it("skips names that exist, ignoring case and whitespace", () => {
    const r = planPackServices("CLINIC", [" general consultation "], Infinity);
    expect(r.skippedExisting).toEqual(["General Consultation"]);
    expect(r.toCreate).toHaveLength(2);
  });
  it("stops at the plan's remaining room", () => {
    const r = planPackServices("SALON_SPA", [], 1);
    expect(r.toCreate).toHaveLength(1);
    expect(r.skippedLimit).toHaveLength(2);
  });
  it("creates nothing when there is no room", () => {
    expect(planPackServices("FITNESS", [], 0).toCreate).toEqual([]);
  });
});

function fakeDb(staffIds: string[]) {
  const services: { id: string; businessId: string; name: string; isActive: boolean }[] = [];
  const links: { staffId: string; serviceId: string }[] = [];
  const db: PackApplyDb = {
    service: {
      findMany: async ({ where }) => services.filter((s) => s.businessId === where.businessId).map(({ name, isActive }) => ({ name, isActive })),
      create: async ({ data }) => {
        const row = { id: `svc${services.length + 1}`, businessId: data.businessId, name: data.name, isActive: true };
        services.push(row);
        return { id: row.id };
      },
    },
    staff: { findMany: async () => staffIds.map((id) => ({ id })) },
    staffService: {
      createMany: async ({ data }) => {
        for (const l of data) if (!links.some((x) => x.staffId === l.staffId && x.serviceId === l.serviceId)) links.push(l);
      },
    },
  };
  return { db, services, links };
}

describe("applyPackDefaults", () => {
  it("applying twice is harmless", async () => {
    const { db, services, links } = fakeDb(["st1", "st2"]);
    const first = await applyPackDefaults(db, "b1", "LAWYER", -1);
    const second = await applyPackDefaults(db, "b1", "LAWYER", -1);
    expect(first.added).toHaveLength(3);
    expect(second.added).toEqual([]);
    expect(second.skippedExisting).toHaveLength(3);
    expect(services).toHaveLength(3);
    expect(links).toHaveLength(6); // 2 staff x 3 services, no duplicates
  });
  it("never touches existing services and respects the limit", async () => {
    const { db, services } = fakeDb(["st1"]);
    services.push({ id: "x", businessId: "b1", name: "My own service", isActive: true });
    const r = await applyPackDefaults(db, "b1", "CLINIC", 2);
    expect(r.added).toHaveLength(1);
    expect(r.skippedLimit).toHaveLength(2);
    expect(services.find((s) => s.id === "x")?.name).toBe("My own service");
  });
  it("does not recreate a soft-deleted default", async () => {
    const { db, services } = fakeDb([]);
    services.push({ id: "x", businessId: "b1", name: "Consultation", isActive: false });
    const r = await applyPackDefaults(db, "b1", "OTHER", -1);
    expect(r.skippedExisting).toEqual(["Consultation"]);
    expect(r.added).toHaveLength(2);
  });
});

describe("pack in signup/onboarding input", () => {
  const base = { businessName: "Glow", currency: "INR" };
  it("accepts a valid pack id", () => {
    const r = onboardingSchema.safeParse({ ...base, packId: "CLINIC" });
    expect(r.success && r.data.packId).toBe("CLINIC");
  });
  it("treats a missing or unknown pack as unset (becomes OTHER)", () => {
    expect(onboardingSchema.safeParse(base).data?.packId).toBeUndefined();
    expect(onboardingSchema.safeParse({ ...base, packId: "HACKER" }).data?.packId).toBeUndefined();
    expect(getPack(undefined).id).toBe("OTHER");
  });
});
