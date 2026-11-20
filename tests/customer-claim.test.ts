import { describe, it, expect, vi, beforeEach } from "vitest";

// Silent customer accounts at booking, and the single-use "claim your Calvy account" link in the confirmation email.

const db = vi.hoisted(() => {
  type Cust = { id: string; email: string; name: string; password: string | null; emailVerified: Date | null; passwordChangedAt?: Date | null };
  type Tok = { tokenHash: string; customerId: string; purpose: string; expiresAt: Date; usedAt: Date | null };
  const customers: Cust[] = [];
  const tokens: Tok[] = [];
  return {
    customers, tokens,
    customer: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => customers.find((c) => (where.email ? c.email === where.email : c.id === where.id)) ?? null),
      create: vi.fn(async ({ data }: { data: { email: string; name: string; password: null } }) => { const c = { id: `c${customers.length + 1}`, emailVerified: null, ...data }; customers.push(c); return c; }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; emailVerified: null }; data: Partial<Cust> }) => {
        const c = customers.find((x) => x.id === where.id && x.emailVerified === null);
        if (!c) return { count: 0 };
        Object.assign(c, data); return { count: 1 };
      }),
    },
    customerToken: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: Tok }) => { tokens.push({ ...data, usedAt: null }); }),
      updateMany: vi.fn(async ({ where, data }: { where: { tokenHash: string; purpose: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash && x.purpose === where.purpose && !x.usedAt && x.expiresAt > where.expiresAt.gt);
        if (!t) return { count: 0 };
        t.usedAt = data.usedAt; return { count: 1 };
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash);
        return t ? { customer: customers.find((c) => c.id === t.customerId) } : null;
      }),
      findFirst: vi.fn(async () => null),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { authOptions } from "@/lib/auth";
import { claimUrlFor, redeemClaim, findOrCreateCustomerByEmail, CLAIM_TTL_MS } from "@/lib/customerClaim";
import { ensureCustomerAccount } from "@/lib/customerInvite";
import { renderTemplate } from "@/lib/notifications/templates";

const tokenOf = (url: string) => new URL(url).searchParams.get("token") as string;
beforeEach(() => { vi.clearAllMocks(); db.customers.length = 0; db.tokens.length = 0; });

describe("silent account creation at booking", () => {
  it("creates a customer by email with no password and no prompt, and sends no email of its own", async () => {
    expect(await ensureCustomerAccount({ email: "Riya@X.co", name: "Riya" })).toBe("created");
    expect(db.customers).toEqual([expect.objectContaining({ email: "riya@x.co", password: null, emailVerified: null })]);
    expect(notify).not.toHaveBeenCalled(); // the confirmation email carries the claim link
  });
  it("finds the same account by email next time, never by anything else (no merging by phone or name)", async () => {
    await findOrCreateCustomerByEmail("riya@x.co", "Riya");
    const again = await findOrCreateCustomerByEmail("RIYA@x.co", "Someone Else");
    expect(db.customers).toHaveLength(1);
    expect(again?.name).toBe("Riya");
    expect(await findOrCreateCustomerByEmail("not an email", "X")).toBeNull();
  });
});

describe("the claim link", () => {
  it("is a 14-day single-use link made for an unclaimed account", async () => {
    const r = await claimUrlFor("riya@x.co", "Riya");
    expect(r).toMatchObject({ claimed: false });
    expect(r!.url).toMatch(/\/account\/claim\?token=[0-9a-f]{64}$/);
    expect(db.tokens[0]).toMatchObject({ purpose: "claim" });
    expect(db.tokens[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(CLAIM_TTL_MS - 5000);
    expect(CLAIM_TTL_MS).toBe(14 * 86_400_000);
  });
  it("an already verified account just gets a plain link to its account, no token", async () => {
    db.customers.push({ id: "c1", email: "riya@x.co", name: "Riya", password: "hash", emailVerified: new Date() });
    const r = await claimUrlFor("riya@x.co", "Riya");
    expect(r).toEqual({ url: expect.stringMatching(/\/account$/), claimed: true });
    expect(db.tokens).toHaveLength(0);
  });
  it("claiming verifies the account and spends the link: a second use is refused", async () => {
    const { url } = (await claimUrlFor("riya@x.co", "Riya"))!;
    expect(await redeemClaim(tokenOf(url))).toMatchObject({ email: "riya@x.co" });
    expect(db.customers[0].emailVerified).toBeInstanceOf(Date);
    expect(await redeemClaim(tokenOf(url))).toBeNull();
  });
  it("an expired link, a link of another kind and junk are refused", async () => {
    const { url } = (await claimUrlFor("riya@x.co", "Riya"))!;
    expect(await redeemClaim(tokenOf(url), new Date(Date.now() + CLAIM_TTL_MS + 60_000))).toBeNull();
    db.tokens[0].purpose = "verify";
    expect(await redeemClaim(tokenOf(url))).toBeNull();
    for (const bad of [undefined, "", "abc", "z".repeat(64)]) expect(await redeemClaim(bad as never)).toBeNull();
  });
  it("the mailbox holder wins: an unverified account someone made WITH a password loses that password when claimed", async () => {
    db.customers.push({ id: "c1", email: "riya@x.co", name: "Squatter", password: "squatter-hash", emailVerified: null });
    const { url } = (await claimUrlFor("riya@x.co", "Riya"))!;
    await redeemClaim(tokenOf(url));
    expect(db.customers[0]).toMatchObject({ password: null, emailVerified: expect.any(Date) });
  });
  it("an unclaimed account cannot sign in with a password (none, or an unverified one)", async () => {
    const provider = authOptions.providers.find((p) => (p as { options?: { id?: string } }).options?.id === "customer") as unknown as { options: { authorize: (c: unknown) => Promise<unknown> } };
    db.customers.push({ id: "c1", email: "riya@x.co", name: "Riya", password: null, emailVerified: null });
    expect(await provider.options.authorize({ email: "riya@x.co", password: "anything-at-all" })).toBeNull();
  });
  it("the claim provider signs a customer in with a fresh link, once", async () => {
    const provider = authOptions.providers.find((p) => (p as { options?: { id?: string } }).options?.id === "customer-claim") as unknown as { options: { authorize: (c: unknown) => Promise<unknown> } };
    const { url } = (await claimUrlFor("riya@x.co", "Riya"))!;
    expect(await provider.options.authorize({ token: tokenOf(url) })).toMatchObject({ kind: "customer", email: "riya@x.co" });
    expect(await provider.options.authorize({ token: tokenOf(url) })).toBeNull();
  });
});

describe("the confirmation email carries the button", () => {
  const payload = { clientName: "Riya Kapoor", businessName: "Glow Salon", serviceName: "Cut", date: "Mon 24 Nov", time: "10:00" };
  it("an unclaimed account: 'Manage your bookings — claim your Calvy account' with the one-time link", async () => {
    const r = await renderTemplate("confirmation", { ...payload, claimUrl: "https://calvy.io/account/claim?token=abc", claimed: false });
    expect(r.html).toContain("claim your Calvy account");
    expect(r.html).toContain("https://calvy.io/account/claim?token=abc");
    expect(r.text).toContain("https://calvy.io/account/claim?token=abc");
  });
  it("a claimed account gets a plain 'Manage your bookings' link; no link at all when there is none", async () => {
    const claimed = await renderTemplate("confirmation", { ...payload, claimUrl: "https://calvy.io/account", claimed: true });
    expect(claimed.html).toContain("Manage your bookings");
    expect(claimed.html).not.toContain("claim your Calvy account");
    const none = await renderTemplate("confirmation", payload);
    expect(none.html).not.toContain("Manage your bookings");
  });
});
