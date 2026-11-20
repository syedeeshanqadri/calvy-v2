import { describe, it, expect, vi, beforeEach } from "vitest";

// Magic-link tokens (single-use, expiring) and the squatting rule: a verified sign-in always wins over an unverified account on the same email.

const db = vi.hoisted(() => {
  type Tok = { tokenHash: string; userId: string; purpose: string; step: number | null; expiresAt: Date; usedAt: Date | null };
  const tokens: Tok[] = [];
  return {
    tokens,
    ownerLoginToken: {
      deleteMany: vi.fn(async ({ where }: { where: { userId: string; purpose: string; usedAt: null } }) => {
        for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].userId === where.userId && tokens[i].purpose === where.purpose && !tokens[i].usedAt) tokens.splice(i, 1);
      }),
      create: vi.fn(async ({ data }: { data: Tok }) => { tokens.push({ ...data, usedAt: null, step: data.step ?? null }); }),
      updateMany: vi.fn(async ({ where, data }: { where: { tokenHash: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash && !x.usedAt && x.expiresAt > where.expiresAt.gt);
        if (t) { t.usedAt = data.usedAt; return { count: 1 }; }
        return { count: 0 };
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => tokens.find((x) => x.tokenHash === where.tokenHash) ?? null),
    },
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    appointment: { count: vi.fn() },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ audit }));

import { authOptions } from "@/lib/auth";
import { issueOwnerLoginToken, redeemOwnerLoginToken, SIGNIN_LINK_TTL_MS, RESUME_LINK_TTL_MS } from "@/lib/ownerLogin";
import { needsTakeover, takeOverUnverified } from "@/lib/ownerTakeover";
import { decideGoogleSignIn } from "@/lib/googleLink";

const NOW = new Date("2026-11-20T10:00:00Z");
beforeEach(() => { vi.clearAllMocks(); db.tokens.length = 0; });

describe("owner sign-in links: single-use and short-lived", () => {
  it("a link works once; the second use is refused", async () => {
    const t = await issueOwnerLoginToken(db as never, "u1", "signin", null, NOW);
    expect(await redeemOwnerLoginToken(db as never, t, new Date(NOW.getTime() + 1000))).toMatchObject({ userId: "u1", purpose: "signin" });
    expect(await redeemOwnerLoginToken(db as never, t, new Date(NOW.getTime() + 2000))).toBeNull();
  });
  it("an expired link is refused: 15 minutes for a sign-in link, 7 days for an onboarding resume link", async () => {
    expect(SIGNIN_LINK_TTL_MS).toBe(15 * 60_000);
    expect(RESUME_LINK_TTL_MS).toBe(7 * 86_400_000);
    const a = await issueOwnerLoginToken(db as never, "u1", "signin", null, NOW);
    expect(await redeemOwnerLoginToken(db as never, a, new Date(NOW.getTime() + SIGNIN_LINK_TTL_MS + 1000))).toBeNull();
    const b = await issueOwnerLoginToken(db as never, "u1", "resume", 3, NOW);
    expect(await redeemOwnerLoginToken(db as never, b, new Date(NOW.getTime() + 2 * 3_600_000))).toMatchObject({ purpose: "resume", step: 3 });
    const c = await issueOwnerLoginToken(db as never, "u1", "resume", 3, NOW);
    expect(await redeemOwnerLoginToken(db as never, c, new Date(NOW.getTime() + RESUME_LINK_TTL_MS + 1000))).toBeNull();
  });
  it("asking for a new sign-in link cancels the old one; resume links do not cancel each other", async () => {
    const old = await issueOwnerLoginToken(db as never, "u1", "signin", null, NOW);
    await issueOwnerLoginToken(db as never, "u1", "signin", null, NOW);
    expect(await redeemOwnerLoginToken(db as never, old, NOW)).toBeNull();
    const r1 = await issueOwnerLoginToken(db as never, "u1", "resume", 2, NOW);
    await issueOwnerLoginToken(db as never, "u1", "resume", 2, NOW);
    expect(await redeemOwnerLoginToken(db as never, r1, NOW)).toMatchObject({ purpose: "resume" });
  });
  it("junk is refused without touching the database", async () => {
    for (const bad of [undefined, null, "", "abc", "z".repeat(64), "A".repeat(64)]) expect(await redeemOwnerLoginToken(db as never, bad as never)).toBeNull();
    expect(db.ownerLoginToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("squatting: a verified sign-in takes ownership of an unverified account", () => {
  const user = (over = {}) => ({ id: "u1", name: "Asha", email: "asha@x.co", emailVerified: null, business: { id: "b1", name: "Glow" }, ...over });
  it("only an unverified account is taken over", () => {
    expect(needsTakeover({ emailVerified: null })).toBe(true);
    expect(needsTakeover({ emailVerified: new Date() })).toBe(false);
    expect(needsTakeover(null)).toBe(false);
  });
  it("a DIFFERENT browser: verifies, clears the password, ends the creator's sessions, audits it, and sends the friendly verified email (nothing about ownership)", async () => {
    db.user.findUnique.mockResolvedValue(user());
    db.appointment.count.mockResolvedValue(0);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await takeOverUnverified("u1", "google", { sameDevice: false, now: NOW })).toBe(true);
    const call = db.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "u1", emailVerified: null });
    expect(call.data).toMatchObject({ emailVerified: NOW, password: null, passwordChangedAt: NOW });
    expect(call.data).not.toHaveProperty("ownershipTransferredAt"); // no real bookings: no review flag
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ businessId: "b1", action: "account.ownership_taken", detail: expect.objectContaining({ via: "google", sameDevice: false, flaggedForReview: false }) }));
    const mail = notify.mock.calls[0][0];
    expect(mail).toMatchObject({ template: "email_verified", recipient: "asha@x.co" });
    expect(JSON.stringify(mail)).not.toMatch(/owner/i);
  });
  it("the SAME browser that created the account: only verified. Nobody is signed out, the password is kept, no flag; the audit entry is still written", async () => {
    db.user.findUnique.mockResolvedValue(user());
    db.appointment.count.mockResolvedValue(9); // even with bookings
    db.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await takeOverUnverified("u1", "magic-link", { sameDevice: true, now: NOW })).toBe(true);
    const data = db.user.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ emailVerified: NOW }); // no password clearing, no passwordChangedAt (which would end sessions), no review flag
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ sameDevice: true, flaggedForReview: false }) }));
    expect(notify.mock.calls[0][0]).toMatchObject({ template: "email_verified" });
  });
  it("flagged for Admin review only when the device differs AND the account has real bookings (the takeover still happens)", async () => {
    db.user.findUnique.mockResolvedValue(user());
    db.appointment.count.mockResolvedValue(7);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await takeOverUnverified("u1", "magic-link", { sameDevice: false, now: NOW })).toBe(true);
    expect(db.user.updateMany.mock.calls[0][0].data).toMatchObject({ emailVerified: NOW, ownershipTransferredAt: NOW });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ bookings: 7, flaggedForReview: true }) }));
  });
  it("no device cookie at all (a job, a cleared browser) counts as a different device", async () => {
    db.user.findUnique.mockResolvedValue(user());
    db.appointment.count.mockResolvedValue(0);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    await takeOverUnverified("u1", "google", { now: NOW });
    expect(db.user.updateMany.mock.calls[0][0].data).toMatchObject({ password: null, passwordChangedAt: NOW });
  });
  it("a verified account is never touched, and a lost race does nothing twice", async () => {
    db.user.findUnique.mockResolvedValue(user({ emailVerified: new Date() }));
    expect(await takeOverUnverified("u1", "google", { now: NOW })).toBe(false);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    db.user.findUnique.mockResolvedValue(user());
    db.appointment.count.mockResolvedValue(0);
    db.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await takeOverUnverified("u1", "google", { now: NOW })).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
  it("Google: an unverified account never blocks the verified owner, a verified password account still does", () => {
    const base = { emailVerified: true, sub: "g1", linkIntentUserId: null };
    expect(decideGoogleSignIn({ ...base, existing: { id: "u1", password: "hash", googleId: null, emailVerified: null } })).toEqual({ action: "link" });
    expect(decideGoogleSignIn({ ...base, existing: { id: "u1", password: "hash", googleId: null, emailVerified: new Date() } })).toEqual({ action: "deny", reason: "password-account" });
    expect(decideGoogleSignIn({ ...base, existing: { id: "u1", password: null, googleId: null, emailVerified: null } })).toEqual({ action: "link" });
    expect(decideGoogleSignIn({ ...base, emailVerified: false, existing: null })).toEqual({ action: "deny", reason: "unverified" });
  });
});

describe("the magic-link sign-in provider", () => {
  const provider = authOptions.providers.find((p) => (p as { options?: { id?: string } }).options?.id === "magic-link") as unknown as { options: { authorize: (c: unknown) => Promise<unknown> } };
  const authorize = (token: string | undefined) => provider.options.authorize({ token });
  it("signs the owner in with a fresh link and verifies the address", async () => {
    const t = await issueOwnerLoginToken(db as never, "u1", "signin", null, new Date());
    db.user.findUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => ("business" in select ? { id: "u1", name: "Asha", email: "a@x.co", emailVerified: null, business: null } : { id: "u1", name: "Asha", email: "a@x.co", isSuperAdmin: false }));
    db.appointment.count.mockResolvedValue(0);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await authorize(t)).toMatchObject({ id: "u1", email: "a@x.co" });
    expect(db.user.updateMany).toHaveBeenCalled(); // emailVerified set
  });
  it("refuses a reused link, and never lets a Calvy admin in this way", async () => {
    const t = await issueOwnerLoginToken(db as never, "u1", "signin", null, new Date());
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Admin", email: "a@x.co", isSuperAdmin: true });
    expect(await authorize(t)).toBeNull(); // a super admin
    expect(await authorize(t)).toBeNull(); // and it was spent anyway
    expect(await authorize("not-a-token")).toBeNull();
  });
});

import { signupDeviceValue, isSignupDevice, SIGNUP_DEVICE_TTL_MS } from "@/lib/signupDevice";

describe("the sign-up device cookie", () => {
  const SECRET = "test-secret";
  it("is signed for one user: valid for them, useless for anyone else, forged or expired", () => {
    const v = signupDeviceValue("u1", SECRET, 1_000);
    expect(isSignupDevice(v, "u1", SECRET, 2_000)).toBe(true);
    expect(isSignupDevice(v, "u2", SECRET, 2_000)).toBe(false);
    expect(isSignupDevice(v, "u1", "other-secret", 2_000)).toBe(false);
    expect(isSignupDevice(v.replace("u1", "u2"), "u2", SECRET, 2_000)).toBe(false);
    expect(isSignupDevice(v, "u1", SECRET, 1_000 + SIGNUP_DEVICE_TTL_MS + 1)).toBe(false);
    expect(isSignupDevice(undefined, "u1", SECRET)).toBe(false);
  });
});
