import { describe, it, expect, vi } from "vitest";
import { revalidateBusinessClaims, BUSINESS_REVALIDATE_MS } from "@/lib/sessionBusiness";

const biz = { id: "b2", slug: "new-slug", name: "New Name" };
const stale = () => ({ uid: "u1", businessId: "b1", businessSlug: "old", businessName: "Old", bizCheckedAt: 0 });

describe("revalidateBusinessClaims", () => {
  it("replaces a stale businessId with the current one", async () => {
    const t = await revalidateBusinessClaims(stale(), async () => biz, 1_000_000);
    expect(t).toMatchObject({ businessId: "b2", businessSlug: "new-slug", businessName: "New Name", bizCheckedAt: 1_000_000 });
  });
  it("clears the claims when the business no longer exists", async () => {
    const t = await revalidateBusinessClaims(stale(), async () => null, 1_000_000);
    expect(t.businessId).toBeUndefined();
    expect(t.businessSlug).toBeUndefined();
  });
  it("picks up a business created after the token was issued (no businessId yet)", async () => {
    const t = await revalidateBusinessClaims({ uid: "u1", bizCheckedAt: 0 } as Record<string, unknown>, async () => biz, 1_000_000);
    expect(t.businessId).toBe("b2");
  });
  it("skips the DB inside the throttle window and checks again after it", async () => {
    const load = vi.fn(async () => biz);
    const t = { ...stale(), bizCheckedAt: 1_000_000 };
    await revalidateBusinessClaims(t, load, 1_000_000 + BUSINESS_REVALIDATE_MS - 1);
    expect(load).not.toHaveBeenCalled();
    expect(t.businessId).toBe("b1");
    await revalidateBusinessClaims(t, load, 1_000_000 + BUSINESS_REVALIDATE_MS);
    expect(load).toHaveBeenCalledOnce();
    expect(t.businessId).toBe("b2");
  });
  it("keeps the claims when the DB throws", async () => {
    const t = await revalidateBusinessClaims(stale(), async () => { throw new Error("db down"); }, 1_000_000);
    expect(t.businessId).toBe("b1");
  });
  it("does nothing without a uid", async () => {
    const load = vi.fn(async () => biz);
    await revalidateBusinessClaims({} as Record<string, unknown>, load, 1_000_000);
    expect(load).not.toHaveBeenCalled();
  });
});
