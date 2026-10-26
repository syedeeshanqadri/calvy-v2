import { describe, expect, it } from "vitest";
import { PACK_IDS } from "@/lib/packs";
import { heroLayoutFor, splitHeadline } from "@/lib/siteLayout";

describe("step-6/redesign-site-foundation: hero layout per pack", () => {
  it("every pack has a layout, and the three looks are all used", () => {
    const used = new Set(PACK_IDS.map((id) => heroLayoutFor(id)));
    expect(used).toEqual(new Set(["split", "arch", "immersive"]));
  });
  it("salons get the arch, lawyers and fitness the dark full-bleed, clinics the split", () => {
    expect(heroLayoutFor("SALON_SPA")).toBe("arch");
    expect(heroLayoutFor("LAWYER")).toBe("immersive");
    expect(heroLayoutFor("FITNESS")).toBe("immersive");
    expect(heroLayoutFor("CLINIC")).toBe("split");
  });
  it("unknown or missing pack falls back to split", () => {
    expect(heroLayoutFor("NOPE")).toBe("split");
    expect(heroLayoutFor(undefined)).toBe("split");
  });
});

describe("step-6/redesign-site-foundation: two-tone headline", () => {
  it("accents the business name when the headline contains it", () => {
    expect(splitHeadline("Welcome to City Care Clinic", "City Care Clinic")).toEqual({ lead: "Welcome to ", accent: "City Care Clinic", trail: "" });
    expect(splitHeadline("Welcome to city care clinic today", "City Care Clinic")).toEqual({ lead: "Welcome to ", accent: "city care clinic", trail: " today" });
  });
  it("otherwise accents the last two words of a longer headline", () => {
    expect(splitHeadline("Quality care for a healthier life", "X Clinic")).toEqual({ lead: "Quality care for a ", accent: "healthier life", trail: "" });
  });
  it("keeps short headlines in one colour, and never accents the whole headline", () => {
    expect(splitHeadline("Book online today", "Acme").accent).toBe("");
    expect(splitHeadline("Sunrise Clinic", "Sunrise Clinic")).toEqual({ lead: "Sunrise Clinic", accent: "", trail: "" });
  });
  it("loses no text", () => {
    for (const [h, n] of [["Welcome to A B C", "A B C"], ["One two three four five", ""], ["Hi", "Hi"]] as const) {
      const s = splitHeadline(h, n);
      expect(s.lead + s.accent + s.trail).toBe(h);
    }
  });
});
