import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Customer accounts: Google sign-in (verified email only, no silent linking, always a customer session),
// account deletion, and "Book again" with the service chosen.

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined, name: "" }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === cookieJar.name && cookieJar.value ? { value: cookieJar.value } : undefined), delete: vi.fn(), set: vi.fn() }),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));

import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { CUSTOMER_LINK_COOKIE, LINK_COOKIE, signCustomerLinkIntent, signLinkIntent, verifyCustomerLinkIntent, verifyLinkIntent } from "@/lib/googleLink";
import { DELETE as deleteAccount } from "@/app/api/customer/profile/route";
import { isCustomerToken, canAccessOwnerArea } from "@/lib/customerAccess";

const SECRET = "test-secret";
process.env.NEXTAUTH_SECRET = SECRET;
const signIn = authOptions.callbacks!.signIn!;
const jwt = authOptions.callbacks!.jwt!;
const google = (verified: boolean | undefined) => ({
  user: { id: "g-123", email: "Riya@Mail.test", name: "Riya" } as never,
  account: { provider: "google-customer", providerAccountId: "g-123" } as never,
  profile: { email_verified: verified } as never,
});
const pwCustomer = { id: "c1", name: "Riya", email: "riya@mail.test", password: "hash", googleId: null, emailVerified: new Date() };

beforeEach(() => { vi.clearAllMocks(); cookieJar.value = undefined; cookieJar.name = ""; db.customer.findUnique.mockResolvedValue(null); });

describe("customer Google sign-in", () => {
  it("rejects an unverified Google email: nothing is created or changed", async () => {
    expect(await signIn(google(false))).toBe("/my/login?error=GoogleDenied");
    db.customer.findUnique.mockResolvedValue(pwCustomer);
    expect(await signIn(google(undefined))).toBe("/my/login?error=GoogleDenied");
    expect(db.customer.create).not.toHaveBeenCalled();
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("never links a password account silently, and points to the password login", async () => {
    db.customer.findUnique.mockResolvedValue(pwCustomer);
    expect(await signIn(google(true))).toBe("/my/login?error=GoogleLinkRequired");
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("links after the signed-in customer asked for it", async () => {
    db.customer.findUnique.mockResolvedValue(pwCustomer);
    db.customer.update.mockResolvedValue(pwCustomer);
    cookieJar.name = CUSTOMER_LINK_COOKIE;
    cookieJar.value = signCustomerLinkIntent("c1", SECRET);
    expect(await signIn(google(true))).toBe(true);
    expect(db.customer.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ googleId: "g-123" }) }));
  });
  it("an owner's Link-Google token cannot link a customer, and the reverse", () => {
    expect(verifyCustomerLinkIntent(signLinkIntent("c1", SECRET), SECRET)).toBeNull();
    expect(verifyLinkIntent(signCustomerLinkIntent("c1", SECRET), SECRET)).toBeNull();
    expect(LINK_COOKIE).not.toBe(CUSTOMER_LINK_COOKIE);
  });
  it("creates a verified customer and turns the sign-in identity into a CUSTOMER session", async () => {
    db.customer.create.mockResolvedValue({ id: "c9", name: "Riya", email: "riya@mail.test" });
    const args = google(true);
    expect(await signIn(args)).toBe(true);
    expect(db.customer.create.mock.calls[0][0].data).toMatchObject({ email: "riya@mail.test", googleId: "g-123", emailVerified: expect.any(Date) });
    expect(db.user.create).not.toHaveBeenCalled(); // never an owner account
    const token = (await jwt({ token: { sub: "c9" }, user: args.user } as never)) as Record<string, unknown>;
    expect(token).toMatchObject({ kind: "customer", customerId: "c9" });
    expect(token.businessId).toBeUndefined();
    expect(isCustomerToken(token)).toBe(true);
    expect(canAccessOwnerArea(token)).toBe(false); // /dashboard, /admin, /crm stay closed to it
  });
  it("an account linked to a different Google login is refused", async () => {
    db.customer.findUnique.mockResolvedValue({ ...pwCustomer, googleId: "g-other" });
    expect(await signIn(google(true))).toBe("/my/login?error=GoogleDenied");
  });
});

describe("delete account", () => {
  const del = (body: unknown) => deleteAccount(new NextRequest("http://localhost/api/customer/profile", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const signedIn = () => { session.current = { user: { kind: "customer", customerId: "c1" } }; };
  beforeEach(() => { signedIn(); });

  it("refuses a guest or an owner session", async () => {
    session.current = null;
    expect((await del({ confirmEmail: "riya@mail.test" })).status).toBe(401);
    session.current = { user: { id: "u1", businessId: "b1" } };
    expect((await del({ confirmEmail: "riya@mail.test" })).status).toBe(401);
    expect(db.customer.delete).not.toHaveBeenCalled();
  });
  it("needs the email typed exactly and, when set, the password", async () => {
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Riya", email: "riya@mail.test", emailVerified: new Date(), passwordChangedAt: null, password: await bcrypt.hash("secret-pass", 4) });
    expect((await del({ confirmEmail: "someone@else.test" })).status).toBe(400);
    expect((await del({ confirmEmail: "riya@mail.test", password: "wrong" })).status).toBe(400);
    expect(db.customer.delete).not.toHaveBeenCalled();
    expect((await del({ confirmEmail: "Riya@Mail.test", password: "secret-pass" })).status).toBe(200);
    expect(db.customer.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
  it("a Google-only account (no password) confirms with the email alone", async () => {
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Riya", email: "riya@mail.test", emailVerified: new Date(), passwordChangedAt: null, password: null });
    expect((await del({ confirmEmail: "riya@mail.test" })).status).toBe(200);
  });
});
