import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

// Customer accounts: the verification gate, linking bookings only after verification, role
// isolation and wallet totals, with a mocked Prisma.

const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerToken: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    customerCredit: { findMany: vi.fn() },
  };
  d.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
const session = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));

import bcrypt from "bcryptjs";
import { POST as verify } from "@/app/api/customer/verify-email/route";
import { POST as signup } from "@/app/api/customer/signup/route";
import { POST as reset } from "@/app/api/customer/reset-password/route";
import { PATCH as profile } from "@/app/api/customer/profile/route";
import { overviewForCustomer } from "@/lib/customerDb";
import { canAccessOwnerArea, customerIdOf, customerSessionCurrent, isCustomerToken } from "@/lib/customerAccess";
import { splitBookings, walletsByBusiness } from "@/lib/customerView";

const TOKEN = "a".repeat(64);
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (body: unknown) =>
  new NextRequest("http://localhost/api/customer/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let passwordHash: string;
beforeEach(async () => {
  vi.clearAllMocks();
  passwordHash = await bcrypt.hash("correct-horse", 4);
  session.current = null;
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

const tokenRow = (over: Record<string, unknown> = {}) => ({
  id: "t1", customerId: "c1", purpose: "verify", tokenHash: hash(TOKEN), usedAt: null, expiresAt: new Date(Date.now() + 3_600_000),
  customer: { password: passwordHash }, ...over,
});

describe("verification gate", () => {
  it("the right link and the signup password verify the email", async () => {
    db.customerToken.findUnique.mockResolvedValue(tokenRow());
    db.customerToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await verify(post("/api/customer/verify-email", { token: TOKEN, password: "correct-horse" }));
    expect(res.status).toBe(200);
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { emailVerified: expect.any(Date) } });
  });

  it("a wrong password does not verify and does not use up the link", async () => {
    db.customerToken.findUnique.mockResolvedValue(tokenRow());
    const res = await verify(post("/api/customer/verify-email", { token: TOKEN, password: "someone-elses" }));
    expect(res.status).toBe(400);
    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.customerToken.updateMany).not.toHaveBeenCalled();
  });

  it("a used, expired, unknown or wrong-purpose link does not verify", async () => {
    for (const rec of [tokenRow({ usedAt: new Date() }), tokenRow({ expiresAt: new Date(Date.now() - 1000) }), tokenRow({ purpose: "reset" }), null]) {
      db.customerToken.findUnique.mockResolvedValue(rec);
      db.customerToken.updateMany.mockResolvedValue({ count: 1 });
      const res = await verify(post("/api/customer/verify-email", { token: TOKEN, password: "correct-horse" }));
      expect(res.status).toBe(400);
    }
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it("a parallel second use of the link loses the atomic claim", async () => {
    db.customerToken.findUnique.mockResolvedValue(tokenRow());
    db.customerToken.updateMany.mockResolvedValue({ count: 0 });
    const res = await verify(post("/api/customer/verify-email", { token: TOKEN, password: "correct-horse" }));
    expect(res.status).toBe(400);
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it("signing up with someone else's email never reveals or changes a VERIFIED account", async () => {
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Real", email: "a@x.com", password: passwordHash, emailVerified: new Date() });
    const res = await signup(post("/api/customer/signup", { name: "Mallory", email: "A@x.com", password: "attacker-pass" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.customer.create).not.toHaveBeenCalled();
    expect(db.customerToken.create).not.toHaveBeenCalled();
  });

  it("an unverified account takes the latest signup's password, so a squatter's cannot stand", async () => {
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Mallory", email: "a@x.com", password: "old", emailVerified: null });
    db.customer.update.mockImplementation(async ({ data }: any) => ({ id: "c1", email: "a@x.com", emailVerified: null, ...data }));
    db.customerToken.findFirst.mockResolvedValue(null);
    await signup(post("/api/customer/signup", { name: "Real", email: "a@x.com", password: "real-password" }));
    const data = db.customer.update.mock.calls[0][0].data;
    expect(data.name).toBe("Real");
    expect(await bcrypt.compare("real-password", data.password)).toBe(true);
  });

  it("resetting the password with the emailed link also verifies the email", async () => {
    db.customerToken.findUnique.mockResolvedValue(tokenRow({ purpose: "reset" }));
    db.customerToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await reset(post("/api/customer/reset-password", { token: TOKEN, password: "brand-new-pass" }));
    expect(res.status).toBe(200);
    expect(db.customer.update.mock.calls[0][0].data.emailVerified).toBeInstanceOf(Date);
  });
});

describe("bookings are linked only after verification", () => {
  beforeEach(() => {
    db.appointment.findMany.mockResolvedValue([]);
    db.customerCredit.findMany.mockResolvedValue([]);
  });

  it("an unverified account gets nothing and the database is not even asked", async () => {
    expect(await overviewForCustomer({ email: "a@x.com", verified: false })).toBeNull();
    expect(db.appointment.findMany).not.toHaveBeenCalled();
    expect(db.customerCredit.findMany).not.toHaveBeenCalled();
  });

  it("a verified account is matched on its verified email, any case, across businesses", async () => {
    await overviewForCustomer({ email: "a@x.com", verified: true });
    const where = db.appointment.findMany.mock.calls[0][0].where;
    // Matched on the verified email across businesses; a moved token's placeholder on the old day is not a booking.
    expect(where).toEqual({ client: { email: { equals: "a@x.com", mode: "insensitive" } }, OR: [{ queueState: null }, { queueState: { not: "MOVED" } }] });
    expect(where.businessId).toBeUndefined();
    expect(db.customerCredit.findMany.mock.calls[0][0].where).toEqual({ client: { email: { equals: "a@x.com", mode: "insensitive" } } });
  });
});

describe("role isolation", () => {
  const customer = { kind: "customer", customerId: "c1" };
  const owner = { uid: "u1", businessId: "b1", role: "user" };

  it("a customer token never opens /dashboard, /admin or /crm; an owner token does", () => {
    expect(canAccessOwnerArea(customer)).toBe(false);
    expect(canAccessOwnerArea(owner)).toBe(true);
    expect(canAccessOwnerArea(null)).toBe(false);
  });
  it("only a customer token acts as a customer", () => {
    expect(isCustomerToken(customer)).toBe(true);
    expect(isCustomerToken(owner)).toBe(false);
    expect(customerIdOf(owner)).toBeNull();
    expect(customerIdOf({ kind: "customer" })).toBeNull();
  });
  it("customer-only APIs refuse an owner session and a guest", async () => {
    session.current = { user: { id: "u1", businessId: "b1", email: "o@x.com" } };
    expect((await profile(patch({ name: "X" }))).status).toBe(401);
    session.current = null;
    expect((await profile(patch({ name: "X" }))).status).toBe(401);
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("a password change or reset ends sessions that began before it", () => {
    const changed = new Date("2026-10-26T10:00:00Z");
    expect(customerSessionCurrent(changed.getTime() - 1, changed)).toBe(false);
    expect(customerSessionCurrent(undefined, changed)).toBe(false);
    expect(customerSessionCurrent(changed.getTime() + 1, changed)).toBe(true);
    expect(customerSessionCurrent(undefined, null)).toBe(true);
  });
  it("an old session is refused by customer APIs after the password changed", async () => {
    session.current = { user: { id: "c1", kind: "customer", customerId: "c1", authAt: 1000 } };
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "A", email: "a@x.com", emailVerified: new Date(), passwordChangedAt: new Date(5000) });
    expect((await profile(patch({ name: "X" }))).status).toBe(401);
  });
  it("a customer session can change its own name", async () => {
    session.current = { user: { id: "c1", kind: "customer", customerId: "c1", authAt: Date.now() } };
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Old", email: "a@x.com", emailVerified: new Date() });
    expect((await profile(patch({ name: "New" }))).status).toBe(200);
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "New" } });
  });
});

describe("wallet totals and booking lists", () => {
  it("sums each business's ledger separately and keeps currencies apart", () => {
    const w = walletsByBusiness([
      { businessId: "b1", businessName: "Clinic", businessSlug: "clinic", currency: "INR", amountMinor: 50000 },
      { businessId: "b1", businessName: "Clinic", businessSlug: "clinic", currency: "INR", amountMinor: -20000 },
      { businessId: "b2", businessName: "Salon", businessSlug: "salon", currency: "USD", amountMinor: 1500 },
    ]);
    expect(w).toEqual([
      { businessId: "b1", businessName: "Clinic", businessSlug: "clinic", currency: "INR", balanceMinor: 30000 },
      { businessId: "b2", businessName: "Salon", businessSlug: "salon", currency: "USD", balanceMinor: 1500 },
    ]);
  });
  it("no ledger rows, no wallets", () => {
    expect(walletsByBusiness([])).toEqual([]);
  });
  it("splits upcoming from past; a lapsed payment hold or a closed booking is past", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const later = new Date("2026-10-27T10:00:00Z");
    const earlier = new Date("2026-10-25T10:00:00Z");
    const { upcoming, past } = splitBookings([
      { id: "a", date: later, status: "confirmed" },
      { id: "b", date: later, status: "cancelled" },
      { id: "c", date: later, status: "pending_payment", holdExpiresAt: new Date(now.getTime() - 1) },
      { id: "d", date: later, status: "pending_payment", holdExpiresAt: new Date(now.getTime() + 60_000) },
      { id: "e", date: earlier, status: "confirmed" },
    ], now);
    expect(upcoming.map((r) => r.id)).toEqual(["a", "d"]);
    expect(past.map((r) => r.id).sort()).toEqual(["b", "c", "e"]);
  });
});
