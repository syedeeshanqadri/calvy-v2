import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!["node_modules", ".next", "migrations"].includes(e.name)) walk(rel, out); } else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
};

describe("the fee is decided once and stored (source checks)", () => {
  it("both booking paths store the level and the fee on the appointment when it is created", () => {
    expect(read("app/api/bookings/route.ts")).toMatch(/feeLevel: feeLevelInfo\.id, feeMinor: feeLevelInfo\.feeMinor/);
    expect(read("lib/tokenBooking.ts")).toMatch(/feeLevel: level\.id, feeMinor: level\.feeMinor/);
  });
  it("nothing rewrites feeLevel or feeMinor later (only the two creates), so a level change never alters an existing order", () => {
    const writers = [...walk("app"), ...walk("lib")].filter((f) => /feeLevel\s*[:=]/.test(read(f)) || /feeMinor:\s*level\./.test(read(f)));
    expect(writers.sort()).toEqual(["app/api/bookings/route.ts", "lib/tokenBooking.ts"]);
  });
  it("only the checkout resolver looks the level fee up (one place, once per booking)", () => {
    const users = [...walk("app"), ...walk("lib")].filter((f) => /feeForCustomer\(/.test(read(f)) && !f.endsWith("levelService.ts"));
    expect(users).toEqual(["lib/coupons/booking.ts"]);
  });
  it("the level fee is only looked up for a verified booker and only where Calvy's fee exists", () => {
    const src = read("lib/coupons/booking.ts");
    expect(src).toMatch(/if \(isFee\) \{[\s\S]*i\.verifiedBooker \? await feeForCustomer/);
  });
});

describe("old tiers are gone", () => {
  it("no Regular/Silver/Gold tier code or UI is left", () => {
    const hits = [...walk("app"), ...walk("lib"), ...walk("components")].filter((f) => /\b(SILVER|GOLD|tierFor|nextTier|hasFreeReschedule|TIERS)\b/.test(read(f)));
    expect(hits).toEqual([]);
  });
});

describe("the customer never sees the rules", () => {
  it("the account page and the level view carry no thresholds", () => {
    const page = read("app/account/(app)/page.tsx");
    expect(page).not.toMatch(/windowDays|alternatives|DEFAULT_LEVEL_CONFIG|referrals:/);
    expect(read("app/account/(app)/LevelUpCelebration.tsx")).not.toMatch(/\bdays\b.*\b\d+\b/);
  });
  it("the only customer-facing level endpoint just marks the celebration seen", () => {
    const src = read("app/api/customer/level/seen/route.ts");
    expect(src).toContain("markLevelUpSeen");
    expect(src).not.toMatch(/adjustLevel|levelConfig\.upsert|level:/);
  });
});

describe("admin changes are audited (source checks)", () => {
  it("settings and manual adjusts need a reason and write an audit entry in the same transaction", () => {
    for (const f of ["app/api/admin/rewards/config/route.ts", "app/api/admin/rewards/adjust/route.ts"]) {
      const src = read(f);
      expect(src).toContain("requireAdminApi");
      expect(src).toContain("cleanReason");
      expect(src).toContain("adminAudit(tx");
      expect(src).toContain("$transaction");
    }
    expect(read("app/api/admin/rewards/config/route.ts")).toContain("before");
  });
  it("the audit entry of a manual adjust holds a masked reference, never the customer's email or phone", () => {
    const src = read("app/api/admin/rewards/adjust/route.ts");
    expect(src).toContain("personRef(identity)");
    expect(src).not.toMatch(/detail: \{ person: identity/);
  });
});
