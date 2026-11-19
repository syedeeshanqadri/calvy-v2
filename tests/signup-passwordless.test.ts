import { describe, it, expect, vi, beforeEach } from "vitest";

// Passwordless sign-up: the one-time ticket opens the first session, the emailed link sets the password and
// verifies the address, and a ticket session ends when the account later gets a password.

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  passwordResetToken: { create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/email", () => ({ sendFormNotification: vi.fn() }));
const createBusinessForUser = vi.hoisted(() => vi.fn(async () => ({ id: "b1" })));
vi.mock("@/lib/createBusiness", () => ({ createBusinessForUser }));
vi.mock("next/server", async () => ({ ...(await vi.importActual<object>("next/server")), after: (fn: () => unknown) => void fn() }));

import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { POST as signup } from "@/app/api/signup/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { signTicket } from "@/lib/signedTicket";
import { signLinkIntent } from "@/lib/googleLink";
import { SIGNUP_TICKET_PURPOSE, SIGNUP_TICKET_TTL_MS } from "@/lib/signupTicket";
import { authEmail } from "@/lib/notifications/events";

const SECRET = "test-secret";
process.env.NEXTAUTH_SECRET = SECRET;
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ticketProvider = authOptions.providers.find((p) => (p as { options?: { id?: string } }).options?.id === "signup-ticket") as unknown as { options: { authorize: (c: unknown) => Promise<unknown> } };
const authorize = (ticket: string | undefined) => ticketProvider.options.authorize({ ticket });

beforeEach(() => { vi.clearAllMocks(); db.user.findFirst.mockResolvedValue(null); db.user.create.mockResolvedValue({ id: "u1" }); db.$transaction.mockResolvedValue([]); db.user.updateMany.mockResolvedValue({ count: 1 }); });

describe("sign-up", () => {
  it("creates a passwordless user, queues the setup email, and returns a sign-in ticket", async () => {
    const res = await signup(post("/api/signup", { name: "Asha Rao", email: "Asha@Glow.test", phone: "+91 98765 43210", packId: "SALON_SPA", timezone: "Asia/Kolkata" }));
    expect(res.status).toBe(201);
    expect(db.user.create).toHaveBeenCalledWith({ data: { name: "Asha Rao", email: "asha@glow.test" } }); // no password, not verified
    expect(createBusinessForUser).toHaveBeenCalledWith(expect.objectContaining({ packId: "SALON_SPA", phone: "+91 98765 43210", region: "IN", currency: "INR", onboardingStep: 2, welcome: false }));
    expect(notify.mock.calls[0][0]).toMatchObject({ template: "owner_account_setup", recipient: "asha@glow.test" });
    expect(String(notify.mock.calls[0][0].secret)).toContain("/reset-password?setup=1&token=");
    expect((await res.json()).ticket).toEqual(expect.any(String));
  });
  it("stores which business's \"Bookings by Calvy\" link the person came from (calvy_ref cookie), and ignores a forged one", async () => {
    const body = { name: "Asha Rao", email: "asha@glow.test", phone: "+91 98765 43210", packId: "SALON_SPA", timezone: "Asia/Kolkata" };
    const withCookie = (value: string) => new NextRequest("http://localhost/api/signup", { method: "POST", headers: { "content-type": "application/json", cookie: `calvy_ref=${value}` }, body: JSON.stringify(body) });
    await signup(withCookie("glow-salon.tenant_site"));
    expect(db.user.create).toHaveBeenLastCalledWith({ data: { name: "Asha Rao", email: "asha@glow.test", signupRef: "glow-salon", signupSource: "tenant_site" } });
    await signup(withCookie("Evil%20Value"));
    expect(db.user.create).toHaveBeenLastCalledWith({ data: { name: "Asha Rao", email: "asha@glow.test" } });
  });
  it("India without a phone is refused; outside India the phone is optional", async () => {
    expect((await signup(post("/api/signup", { name: "A", email: "a@x.co", packId: "OTHER", timezone: "Asia/Kolkata" }))).status).toBe(400);
    expect((await signup(post("/api/signup", { name: "A", email: "a@x.co", packId: "OTHER", timezone: "Europe/Paris" }))).status).toBe(201);
  });
  it("an existing email is not overwritten", async () => {
    db.user.findFirst.mockResolvedValue({ id: "old" });
    expect((await signup(post("/api/signup", { name: "A", email: "a@x.co", packId: "OTHER", timezone: "Europe/Paris" }))).status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe("sign-up ticket", () => {
  const fresh = () => signTicket(SIGNUP_TICKET_PURPOSE, "u1", SECRET, SIGNUP_TICKET_TTL_MS);
  it("opens a session for a passwordless account", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Asha", email: "a@x.co", password: null });
    expect(await authorize(fresh())).toMatchObject({ id: "u1", viaTicket: true });
  });
  it("is refused when expired, forged, of another kind, or for an account that already has a password", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Asha", email: "a@x.co", password: null });
    expect(await authorize(signTicket(SIGNUP_TICKET_PURPOSE, "u1", SECRET, SIGNUP_TICKET_TTL_MS, Date.now() - 11 * 60_000))).toBeNull();
    expect(await authorize(fresh().replace("u1", "u2"))).toBeNull();
    expect(await authorize(signLinkIntent("u1", SECRET))).toBeNull(); // a Google link token is not a login ticket
    expect(await authorize(undefined)).toBeNull();
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Asha", email: "a@x.co", password: "hash" });
    expect(await authorize(fresh())).toBeNull();
  });
});

describe("a ticket session ends when the account gets a password", () => {
  const jwt = authOptions.callbacks!.jwt!;
  it("stays valid before, throws after", async () => {
    const token = { uid: "u1", ticketAuthAt: 1_000, sub: "u1" } as never;
    db.user.findUnique.mockResolvedValue({ passwordChangedAt: null });
    await expect(jwt({ token } as never)).resolves.toBeTruthy();
    db.user.findUnique.mockResolvedValue({ passwordChangedAt: new Date(2_000) });
    await expect(jwt({ token } as never)).rejects.toThrow("SessionRevoked");
  });
});

describe("setup email resend", () => {
  it("forgot-password sends the setup template to a passwordless, unverified account", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u1", email: "a@x.co", name: "Asha", password: null, emailVerified: null });
    await forgot(post("/api/auth/forgot-password", { email: "a@x.co" }));
    expect(notify.mock.calls[0][0]).toMatchObject({ template: "owner_account_setup" });
  });
  it("a Google-only account (verified, no password) gets nothing", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u1", email: "a@x.co", name: "Asha", password: null, emailVerified: new Date() });
    await forgot(post("/api/auth/forgot-password", { email: "a@x.co" }));
    expect(notify).not.toHaveBeenCalled();
  });
  it("the setup link points at the reset page in setup mode", () => {
    expect(authEmail({ template: "owner_account_setup", userId: "u", to: "a@x.co", name: "A", token: "t", baseUrl: "https://calvy.io" }).secret).toBe("https://calvy.io/reset-password?setup=1&token=t");
  });
});

import { CREDENTIALS_PROVIDER_IDS } from "@/lib/authProviders";

describe("credentials providers and the signIn gate", () => {
  const signIn = authOptions.callbacks!.signIn!;
  const call = (account: unknown) => signIn({ user: { id: "u1", email: "a@x.co" }, account } as never);
  it("registers exactly the credentials providers we intend: password, sign-up ticket, customer", () => {
    const ids = authOptions.providers.filter((p) => (p as { type?: string }).type === "credentials").map((p) => (p as { options?: { id?: string } }).options?.id ?? (p as { id?: string }).id).sort();
    expect(ids).toEqual([...CREDENTIALS_PROVIDER_IDS].sort());
  });
  it("admits the three, and refuses any other provider id, credentials or not", async () => {
    for (const provider of CREDENTIALS_PROVIDER_IDS) expect(await call({ type: "credentials", provider })).toBe(true);
    db.user.findUnique.mockResolvedValue(null); db.user.findFirst.mockResolvedValue(null);
    expect(await call({ type: "credentials", provider: "made-up" })).not.toBe(true);
    expect(await call({ type: "oauth", provider: "made-up" })).toBe(false);
    expect(await call({ type: "oauth", provider: "signup-ticket" })).toBe(false); // the id alone is not enough: the type must be credentials
  });
});

describe("sign-up then automatic sign-in", () => {
  it("the ticket the sign-up returns opens the first session, and the signIn gate lets it through", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" });
    const res = await signup(post("/api/signup", { name: "Asha Rao", email: "a@x.co", packId: "SALON_SPA", timezone: "Asia/Kolkata", phone: "+91 98765 43210" }));
    const { ticket } = await res.json();
    expect(ticket).toBeTruthy();
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Asha", email: "a@x.co", password: null });
    expect(await authorize(ticket)).toMatchObject({ id: "u1", viaTicket: true });
    expect(await authOptions.callbacks!.signIn!({ user: { id: "u1", email: "a@x.co" }, account: { type: "credentials", provider: "signup-ticket" } } as never)).toBe(true);
  });
});

describe("the sign-up ticket is single-use, short-lived and bound to one user", () => {
  const fresh = () => signTicket(SIGNUP_TICKET_PURPOSE, "u1", SECRET, SIGNUP_TICKET_TTL_MS);
  beforeEach(() => db.user.findUnique.mockResolvedValue({ id: "u1", name: "Asha", email: "a@x.co", password: null }));
  it("a reused ticket is refused: the second claim finds it already spent", async () => {
    const t = fresh();
    db.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await authorize(t)).toMatchObject({ id: "u1" });
    expect(await authorize(t)).toBeNull();
    // The claim is one conditional write on this user only, so two simultaneous requests cannot both win.
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1", password: null, signupTicketUsedAt: null }, data: { signupTicketUsedAt: expect.any(Date) } });
  });
  it("an expired ticket is refused and does not even try to claim", async () => {
    expect(SIGNUP_TICKET_TTL_MS).toBeLessThanOrEqual(10 * 60_000);
    expect(await authorize(signTicket(SIGNUP_TICKET_PURPOSE, "u1", SECRET, SIGNUP_TICKET_TTL_MS, Date.now() - SIGNUP_TICKET_TTL_MS - 1000))).toBeNull();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it("a ticket cannot be moved to another user", async () => {
    expect(await authorize(fresh().replace("u1", "u2"))).toBeNull();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});
