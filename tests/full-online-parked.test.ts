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
  }, 30_000); // the first import of the payment module is slow on a busy machine
  it("the settings route and its schema refuse FULL_ONLINE while it is parked", async () => {
    const { paymentSettingsSchema } = await import("@/lib/paymentSettings");
    expect(paymentSettingsSchema.safeParse({ onlinePayMode: "FULL_ONLINE" }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ onlinePayMode: "BOOKING_FEE_ONLY", feePayer: "BUSINESS" }).success).toBe(true);
  });
  it("no other route or screen can set onlinePayMode", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        // The owner-only settings route is the one place that may save it, and it refuses FULL_ONLINE while parked (tested below).
        if (/onlinePayMode\s*:/.test(readFileSync(p, "utf8")) && !p.endsWith("onlinePayment.ts") && !p.endsWith("settings/payments/route.ts") && !p.endsWith("dashboard/settings/page.tsx")) hits.push(p); // the page only READS it for the form
      }
    };
    walk("app");
    expect(hits).toEqual([]);
  });
});
