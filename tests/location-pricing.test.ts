import { describe, it, expect } from "vitest";
import {
  REGION_PRICING, formatMoney, yearlySavePercent, yearlySaveBadge, isFeatureHeading, PRICING_NOTE,
} from "@/lib/pricing";
import {
  resolveRegion, regionFromCountry, regionFromCookieHeader, regionCookieString, parseRegion,
} from "@/lib/region";

const h = (o: Record<string, string>) => new Headers(o);

describe("region detection", () => {
  it("maps IN to India and any other country to International", () => {
    expect(regionFromCountry("IN")).toBe("IN");
    expect(regionFromCountry("in")).toBe("IN");
    expect(regionFromCountry("US")).toBe("INTL");
    expect(regionFromCountry("XX")).toBeNull();
    expect(regionFromCountry("T1")).toBeNull();
    expect(regionFromCountry("")).toBeNull();
    expect(regionFromCountry(undefined)).toBeNull();
  });
  it("prefers CF-IPCountry over x-vercel-ip-country", async () => {
    const r = await resolveRegion({ headers: h({ "cf-ipcountry": "IN", "x-vercel-ip-country": "US" }) });
    expect(r).toEqual({ region: "IN", source: "header" });
  });
  it("falls back to the Vercel header when Cloudflare sends nothing useful", async () => {
    const r = await resolveRegion({ headers: h({ "cf-ipcountry": "XX", "x-vercel-ip-country": "IN" }) });
    expect(r.region).toBe("IN");
  });
  it("falls back to the IP lookup, then to INTL when it fails or throws", async () => {
    expect(await resolveRegion({ headers: h({}), lookupCountry: async () => "IN" })).toEqual({ region: "IN", source: "ip" });
    expect(await resolveRegion({ headers: h({}), lookupCountry: async () => null })).toEqual({ region: "INTL", source: "default" });
    expect(await resolveRegion({ headers: h({}), lookupCountry: async () => { throw new Error("timeout"); } })).toEqual({ region: "INTL", source: "default" });
    expect(await resolveRegion({ headers: h({}) })).toEqual({ region: "INTL", source: "default" });
  });
  it("does not call the IP lookup when a header already answered", async () => {
    let called = false;
    await resolveRegion({ headers: h({ "x-vercel-ip-country": "GB" }), lookupCountry: async () => { called = true; return "IN"; } });
    expect(called).toBe(false);
  });
});

describe("calvy_region cookie override", () => {
  it("wins over detection headers", async () => {
    const r = await resolveRegion({ cookie: "a=1; calvy_region=INTL; b=2", headers: h({ "cf-ipcountry": "IN" }) });
    expect(r).toEqual({ region: "INTL", source: "cookie" });
  });
  it("ignores invalid values", async () => {
    expect(regionFromCookieHeader("calvy_region=FR")).toBeNull();
    expect(parseRegion("IN")).toBe("IN");
    const r = await resolveRegion({ cookie: "calvy_region=FR", headers: h({ "cf-ipcountry": "IN" }) });
    expect(r.region).toBe("IN");
  });
  it("round-trips through the cookie string the switcher writes", () => {
    const set = regionCookieString("IN");
    expect(set).toMatch(/^calvy_region=IN; Path=\/; Max-Age=\d+; SameSite=Lax$/);
    expect(regionFromCookieHeader(set.split(";")[0])).toBe("IN");
  });
});

describe("price config", () => {
  it("INTL keeps the ported USD prices", () => {
    expect(REGION_PRICING.INTL.currency).toBe("USD");
    expect(REGION_PRICING.INTL.plans.map((p) => [p.monthly, p.yearlyPerMonth, p.yearlyTotal])).toEqual([[0, 0, 0], [6, 5, 60], [14, 12, 144]]);
  });
  it("IN has the agreed INR prices", () => {
    expect(REGION_PRICING.IN.currency).toBe("INR");
    expect(REGION_PRICING.IN.plans.map((p) => [p.name, p.monthly, p.yearlyPerMonth, p.yearlyTotal])).toEqual([
      ["Free Forever", 0, 0, 0],
      ["Pro", 349, 299, 3588],
      ["Business", 799, 699, 8388],
    ]);
    expect(REGION_PRICING.IN.headline).toBe("Free forever. Only ₹10 per confirmed online booking.");
    expect(REGION_PRICING.INTL.headline).toBeUndefined();
    expect(PRICING_NOTE).toMatch(/no per-staff fees/);
  });
  it("yearly totals are 12 x the yearly per-month price in both regions", () => {
    for (const r of Object.values(REGION_PRICING)) for (const p of r.plans) expect(p.yearlyTotal).toBe(p.yearlyPerMonth * 12);
  });
  it("paid IN plans drop the platform fee and the free plan states it", () => {
    const [free, pro, biz] = REGION_PRICING.IN.plans;
    expect(free.features.join(" ")).toMatch(/₹10 platform fee per confirmed online booking/);
    expect(pro.features).toContain("No ₹10 platform fee");
    expect(biz.features).toContain("No ₹10 platform fee");
    expect(pro.features.filter(isFeatureHeading)).toEqual(["Everything in Free, plus:"]);
  });
  it("savings badge is calculated from the config", () => {
    expect(yearlySavePercent(REGION_PRICING.INTL.plans)).toBe(17);
    expect(yearlySavePercent(REGION_PRICING.IN.plans)).toBe(14);
    expect(yearlySaveBadge(REGION_PRICING.IN.plans)).toBe("Save up to 14%");
    expect(yearlySavePercent([])).toBe(0);
  });
  it("formats money per region", () => {
    expect(formatMoney(3588, REGION_PRICING.IN)).toBe("₹3,588");
    expect(formatMoney(60, REGION_PRICING.INTL)).toBe("$60");
  });
});
