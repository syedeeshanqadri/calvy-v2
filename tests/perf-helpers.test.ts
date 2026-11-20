import { describe, it, expect, vi, beforeEach } from "vitest";
import { unsplashLoader, isUnsplash } from "@/lib/imageLoaders";

describe("unsplash image loader", () => {
  const src = "https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1600&h=1200&q=80";
  it("asks for the width the layout needs, drops the fixed height, keeps it cropped", () => {
    const u = new URL(unsplashLoader({ src, width: 750 }));
    expect(u.searchParams.get("w")).toBe("750");
    expect(u.searchParams.has("h")).toBe(false);
    expect(u.searchParams.get("fit")).toBe("crop");
    expect(u.searchParams.get("q")).toBe("75");
  });
  it("only applies to Unsplash URLs", () => {
    expect(isUnsplash(src)).toBe(true);
    expect(isUnsplash("https://abc.public.blob.vercel-storage.com/x.jpg")).toBe(false);
    expect(isUnsplash(undefined)).toBe(false);
  });
});

describe("plan config cache is off under test, so admin edits and per-test rows are always read fresh", () => {
  const db = vi.hoisted(() => ({ planConfig: { findUnique: vi.fn() } }));
  vi.mock("@/lib/prisma", () => ({ prisma: db }));
  beforeEach(() => vi.clearAllMocks());
  it("reads the table every call", async () => {
    const { getLimitsFromDB, PLAN_LIMITS, configFromLimits } = await import("@/lib/plans");
    db.planConfig.findUnique.mockResolvedValue({ ...configFromLimits({ ...PLAN_LIMITS.free, maxStaff: 4 }) });
    expect((await getLimitsFromDB("free", "INTL")).maxStaff).toBe(4);
    db.planConfig.findUnique.mockResolvedValue({ ...configFromLimits({ ...PLAN_LIMITS.free, maxStaff: 9 }) });
    expect((await getLimitsFromDB("free", "INTL")).maxStaff).toBe(9);
  });
});
