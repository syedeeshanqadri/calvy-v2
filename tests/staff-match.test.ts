import { describe, it, expect } from "vitest";
import { qualifiedStaff, bookableServices, providerOptions } from "@/lib/staffMatch";

// Public booking page rules: only staff who perform ALL selected services are offered.
const staff = [
  { id: "alex", serviceIds: ["cut", "consult", "premium"] },
  { id: "jordan", serviceIds: ["cut", "colour"] },
  { id: "maya", serviceIds: ["consult"] },
];
const services = [{ id: "cut" }, { id: "colour" }, { id: "consult" }, { id: "premium" }, { id: "orphan" }];

describe("staff filtering", () => {
  it("one service: everyone who does it", () => {
    expect(qualifiedStaff(staff, ["cut"]).map((s) => s.id)).toEqual(["alex", "jordan"]);
  });
  it("several services: only staff linked to all of them", () => {
    expect(qualifiedStaff(staff, ["cut", "colour"]).map((s) => s.id)).toEqual(["jordan"]);
    expect(qualifiedStaff(staff, ["cut", "consult"]).map((s) => s.id)).toEqual(["alex"]);
  });
  it("no single staff member offers the combination", () => {
    expect(qualifiedStaff(staff, ["colour", "consult"])).toEqual([]);
    expect(providerOptions(staff, ["colour", "consult"])).toEqual({ kind: "none" });
  });
  it("'No preference' is only offered among qualified staff, never unqualified ones", () => {
    const opts = providerOptions(staff, ["colour"]);
    expect(opts).toMatchObject({ kind: "choose", offerNoPreference: true });
    if (opts.kind === "choose") expect(opts.staff.map((s) => s.id)).toEqual(["jordan"]);
  });
  it("a business without staff has nothing to choose", () => {
    expect(providerOptions([], ["cut"])).toEqual({ kind: "shared" });
  });
});

describe("service visibility", () => {
  it("hides services no active staff member is linked to", () => {
    expect(bookableServices(services, staff).map((s) => s.id)).toEqual(["cut", "colour", "consult", "premium"]);
  });
  it("keeps everything for a business with no staff (shared calendar)", () => {
    expect(bookableServices(services, [])).toHaveLength(5);
  });
});
