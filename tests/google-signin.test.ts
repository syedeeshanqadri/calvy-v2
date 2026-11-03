import { describe, it, expect, vi, beforeEach } from "vitest";

// Google sign-in rules: only verified emails, and an email match never silently links a password account.

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieJar.value ? { value: cookieJar.value } : undefined), delete: vi.fn() }) }));

import { authOptions } from "@/lib/auth";
import { decideGoogleSignIn, signLinkIntent, verifyLinkIntent } from "@/lib/googleLink";

const SECRET = "test-secret";
process.env.NEXTAUTH_SECRET = SECRET;
const signIn = authOptions.callbacks!.signIn!;
const google = (verified: boolean | undefined) => ({
  user: { email: "Asha@Glow.test", name: "Asha" } as never,
  account: { provider: "google", providerAccountId: "g-123" } as never,
  profile: { email_verified: verified } as never,
});
const pwUser = { id: "u1", email: "asha@glow.test", password: "hash", googleId: null, emailVerified: new Date() };

beforeEach(() => { vi.clearAllMocks(); cookieJar.value = undefined; db.user.findUnique.mockResolvedValue(null); db.user.findFirst.mockResolvedValue(null); });

describe("unverified Google email", () => {
  it("is rejected for a brand-new address: no user is created", async () => {
    expect(await signIn(google(false))).toBe("/login?error=GoogleDenied");
    expect(await signIn(google(undefined))).toBe("/login?error=GoogleDenied");
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("is rejected for an existing account too: nothing is updated", async () => {
    db.user.findUnique.mockResolvedValue(pwUser);
    expect(await signIn(google(false))).toBe("/login?error=GoogleDenied");
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("no silent account linking", () => {
  it("a password account with the same email is refused, with a pointer to log in first", async () => {
    db.user.findUnique.mockResolvedValue(pwUser);
    expect(await signIn(google(true))).toBe("/login?error=GoogleLinkRequired");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("after the owner starts 'Link Google' while logged in, the same Google login links", async () => {
    db.user.findUnique.mockResolvedValue(pwUser);
    cookieJar.value = signLinkIntent("u1", SECRET);
    expect(await signIn(google(true))).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" }, data: expect.objectContaining({ googleId: "g-123" }) }));
  });
  it("a link request signed for a different user does not link", async () => {
    db.user.findUnique.mockResolvedValue(pwUser);
    cookieJar.value = signLinkIntent("someone-else", SECRET);
    expect(await signIn(google(true))).toBe("/login?error=GoogleLinkRequired");
  });
  it("a new verified Google user is created with their Google id; a linked one signs in", async () => {
    expect(await signIn(google(true))).toBe(true);
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({ email: "asha@glow.test", googleId: "g-123" });
    db.user.findUnique.mockResolvedValue({ ...pwUser, googleId: "g-123" });
    expect(await signIn(google(true))).toBe(true);
  });
  it("an account linked to a different Google login is refused", async () => {
    db.user.findUnique.mockResolvedValue({ ...pwUser, googleId: "g-other" });
    expect(await signIn(google(true))).toBe("/login?error=GoogleDenied");
  });
});

describe("pure decision and signed intent", () => {
  it("decides each case", () => {
    const e = { id: "u1", password: "x", googleId: null };
    expect(decideGoogleSignIn({ emailVerified: true, sub: "g", existing: null, linkIntentUserId: null })).toEqual({ action: "create" });
    expect(decideGoogleSignIn({ emailVerified: true, sub: "g", existing: e, linkIntentUserId: null })).toMatchObject({ action: "deny", reason: "password-account" });
    expect(decideGoogleSignIn({ emailVerified: true, sub: "g", existing: e, linkIntentUserId: "u1" })).toEqual({ action: "link" });
    expect(decideGoogleSignIn({ emailVerified: true, sub: "g", existing: { ...e, password: null }, linkIntentUserId: null })).toEqual({ action: "link" });
  });
  it("the signed link intent expires, and a tampered one is rejected", () => {
    const t = signLinkIntent("u1", SECRET, 1_000);
    expect(verifyLinkIntent(t, SECRET, 2_000)).toBe("u1");
    expect(verifyLinkIntent(t, SECRET, 1_000 + 11 * 60_000)).toBeNull();
    expect(verifyLinkIntent(t.replace("u1", "u2"), SECRET, 2_000)).toBeNull();
    expect(verifyLinkIntent(t, "other-secret", 2_000)).toBeNull();
  });
});
