import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { FULL_ONLINE_ENABLED, effectivePayMode } from "@/lib/fees";

// chore/park-pay-links-full-online: FULL_ONLINE needs the payout account and split (parked chunk 12),
// so it must stay unreachable: nothing can set it, and a stored value is treated as booking-fee-only.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => ({ name: "MOCK" }) }));
vi.mock("@/lib/getFeatures", () => ({ getEffectiveLimits: async () => ({ platformFeeMinorIN: 1000 }) }));

const biz = (onlinePayMode: "BOOKING_FEE_ONLY" | "FULL_ONLINE") => ({
  plan: "free", planStatus: "active", currency: "INR", onlinePayMode, feePayer: "CUSTOMER" as const,
});

describe("FULL_ONLINE stays unreachable until chunk 12", () => {
  it("is switched off", () => {
    expect(FULL_ONLINE_ENABLED).toBe(false);
    expect(effectivePayMode("FULL_ONLINE")).toBe("BOOKING_FEE_ONLY");
    expect(effectivePayMode("BOOKING_FEE_ONLY")).toBe("BOOKING_FEE_ONLY");
  });
  it("a business stored as FULL_ONLINE is offered booking-fee-only and charged just the fee", async () => {
    const { getPayConfig, chargeFor } = await import("@/lib/onlinePayment");
    const cfg = await getPayConfig(biz("FULL_ONLINE"));
    expect(cfg?.mode).toBe("BOOKING_FEE_ONLY");
    expect(chargeFor(cfg, 500)).toEqual({ chargeMinor: 1000, platformFeeMinor: 1000, businessShareMinor: 0 });
  });
  it("no route or screen can set onlinePayMode", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        if (/onlinePayMode\s*:/.test(readFileSync(p, "utf8")) && !p.endsWith("onlinePayment.ts")) hits.push(p);
      }
    };
    walk("app");
    expect(hits).toEqual([]);
  });
});
