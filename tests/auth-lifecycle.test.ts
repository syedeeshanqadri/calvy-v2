import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeEmail, tryNormalizeEmail, findClientByEmail } from "@/lib/email-normalize";
import {
  generateToken,
  hashToken,
  verifyToken,
  createResetToken,
  isExpired,
  isUsableResetToken,
  RESET_TOKEN_TTL_MS,
  tokenExpiry,
} from "@/lib/auth-tokens";
import { forgotPasswordSchema, resetPasswordSchema, resendVerificationSchema } from "@/lib/validation/auth";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  B4-Test@Example.COM ")).toBe("b4-test@example.com");
  });
  it("rejects non-strings", () => {
    expect(() => normalizeEmail(undefined)).toThrow(TypeError);
    expect(() => normalizeEmail(42)).toThrow(TypeError);
    expect(tryNormalizeEmail(null)).toBeNull();
    expect(tryNormalizeEmail(" A@b.co ")).toBe("a@b.co");
  });
  it("findClientByEmail prefers exact lowercase, then case-insensitive", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "c1" });
    const found = await findClientByEmail({ client: { findFirst } }, "biz1", "Demo.Client@EXAMPLE.com");
    expect(found).toEqual({ id: "c1" });
    expect(findFirst.mock.calls[0][0].where).toEqual({ businessId: "biz1", email: "demo.client@example.com" });
    expect(findFirst.mock.calls[1][0].where).toEqual({
      businessId: "biz1",
      email: { equals: "demo.client@example.com", mode: "insensitive" },
    });
  });
});

describe("auth tokens", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  it("generates 64 hex chars, unique, and hashes deterministically", () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("verifies only the matching token", () => {
    const { token, tokenHash } = createResetToken(t0);
    expect(verifyToken(token, tokenHash)).toBe(true);
    expect(verifyToken(generateToken(), tokenHash)).toBe(false);
    expect(verifyToken("zz", tokenHash)).toBe(false);
  });
  it("expires after one hour with an injectable clock", () => {
    const { expiresAt } = createResetToken(t0);
    expect(expiresAt.getTime() - t0.getTime()).toBe(RESET_TOKEN_TTL_MS);
    expect(isExpired(expiresAt, new Date(t0.getTime() + RESET_TOKEN_TTL_MS - 1))).toBe(false);
    expect(isExpired(expiresAt, new Date(t0.getTime() + RESET_TOKEN_TTL_MS))).toBe(true);
    expect(tokenExpiry(1000, t0).getTime()).toBe(t0.getTime() + 1000);
  });
  it("usable only when unused and unexpired", () => {
    const exp = new Date(t0.getTime() + 1000);
    expect(isUsableResetToken({ expiresAt: exp, usedAt: null }, t0)).toBe(true);
    expect(isUsableResetToken({ expiresAt: exp, usedAt: t0 }, t0)).toBe(false);
    expect(isUsableResetToken({ expiresAt: exp, usedAt: null }, new Date(t0.getTime() + 2000))).toBe(false);
    expect(isUsableResetToken(null, t0)).toBe(false);
  });
});

describe("zod schemas", () => {
  it("normalises and validates email", () => {
    expect(forgotPasswordSchema.parse({ email: "  A@Example.COM " })).toEqual({ email: "a@example.com" });
    expect(resendVerificationSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "a".repeat(250) + "@x.co" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 5 }).success).toBe(false);
  });
  it("validates reset password body", () => {
    const token = "a".repeat(64);
    expect(resetPasswordSchema.safeParse({ token, password: "12345678" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: "1234567" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token, password: "x".repeat(72) }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: "x".repeat(73) }).success).toBe(false);
    // 3-byte chars: 25 chars = 75 bytes
    expect(resetPasswordSchema.safeParse({ token, password: "€".repeat(25) }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "short", password: "12345678" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "a".repeat(5000), password: "12345678" }).success).toBe(false);
  });
});

// ---- route handler tests (mocked prisma, email, ratelimit) ----
const mocks = vi.hoisted(() => {
  const m = {
    rateLimit: vi.fn(),
    notify: vi.fn(),
    user: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    prt: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    vt: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return m;
});

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
  clientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: mocks.notify }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: mocks.user,
    passwordResetToken: mocks.prt,
    verificationToken: mocks.vt,
    $transaction: mocks.$transaction,
  },
}));

import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { POST as resend } from "@/app/api/auth/resend-verification/route";

/** The raw token travels only inside the emailed link (the encrypted secret), never in the key or payload. */
const tokenOf = (n: { secret: string }) => new URL(n.secret).searchParams.get("token");

function req(body: unknown, raw = false) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 });
  mocks.notify.mockResolvedValue(undefined);
  mocks.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)({ user: mocks.user, passwordResetToken: mocks.prt })
      : Promise.all(arg as Promise<unknown>[]),
  );
});

describe("POST /api/auth/forgot-password", () => {
  it("returns identical 200 bodies for known, unknown and OAuth-only accounts", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", password: "hash" });
    const known = await forgot(req({ email: "A@x.co" }));
    mocks.user.findFirst.mockResolvedValueOnce(null);
    const unknown = await forgot(req({ email: "nobody@x.co" }));
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u2", email: "o@x.co", name: "O", password: null });
    const oauth = await forgot(req({ email: "o@x.co" }));
    for (const r of [known, unknown, oauth]) expect(r.status).toBe(200);
    const bodies = await Promise.all([known.json(), unknown.json(), oauth.json()]);
    expect(bodies[0]).toEqual({ ok: true });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("stores only the hash and emails the raw token with a 1h expiry", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", password: "hash" });
    await forgot(req({ email: "a@x.co" }));
    const created = mocks.prt.create.mock.calls[0][0].data;
    const queued = mocks.notify.mock.calls[0][0];
    expect(queued).toMatchObject({ event: "auth.reset", audience: "BUSINESS", template: "password_reset", recipient: "a@x.co", subjectId: "u1" });
    expect(queued.secret).toMatch(/\/reset-password\?token=/);
    expect(JSON.stringify({ ...queued, secret: undefined })).not.toContain(tokenOf(queued)!);
    expect(created.tokenHash).toBe(hashToken(tokenOf(queued)!));
    expect(created).not.toHaveProperty("token");
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS);
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(RESET_TOKEN_TTL_MS - 5000);
    expect(mocks.prt.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });
  });

  it("still returns 200 when sending fails", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", password: "hash" });
    mocks.notify.mockRejectedValueOnce(new Error("boom"));
    const r = await forgot(req({ email: "a@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("does not leak the token without the test hook", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", password: "hash" });
    const r = await forgot(req({ email: "a@x.co" }));
    expect(await r.json()).not.toHaveProperty("devToken");
  });

  it("returns the token only with the hook set and never in production", async () => {
    vi.stubEnv("AUTH_TEST_RETURN_TOKEN", "1");
    vi.stubEnv("NODE_ENV", "test");
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", password: "hash" });
    expect(await (await forgot(req({ email: "a@x.co" }))).json()).toHaveProperty("devToken");
    vi.stubEnv("NODE_ENV", "production");
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", password: "hash" });
    expect(await (await forgot(req({ email: "a@x.co" }))).json()).toEqual({ ok: true });
    vi.unstubAllEnvs();
  });

  it("400 on malformed JSON and invalid email", async () => {
    expect((await forgot(req("{not json", true))).status).toBe(400);
    expect((await forgot(req({ email: "bad" }))).status).toBe(400);
  });

  it("429 with Retry-After when rate limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 42 });
    const r = await forgot(req({ email: "a@x.co" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("42");
    expect(await r.json()).toMatchObject({ retryAfter: 42 });
    expect(mocks.user.findFirst).not.toHaveBeenCalled();
  });

  it("applies the per-email limit (3 per 15 min) and per-IP limit (5 per 15 min)", async () => {
    await forgot(req({ email: "A@x.co" }));
    expect(mocks.rateLimit).toHaveBeenCalledWith("forgot:ip:1.2.3.4", 5, 900000);
    expect(mocks.rateLimit).toHaveBeenCalledWith("forgot:email:a@x.co", 3, 900000);
  });
});

describe("POST /api/auth/reset-password", () => {
  const token = generateToken();
  const good = { id: "t1", userId: "u1", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000), usedAt: null };
  const MSG = "This reset link is invalid or has expired.";

  it("resets the password on a valid token", async () => {
    mocks.prt.findUnique.mockResolvedValueOnce(good);
    mocks.prt.updateMany.mockResolvedValueOnce({ count: 1 });
    const r = await reset(req({ token, password: "new-password-1" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(mocks.prt.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken(token) } });
    const upd = mocks.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "u1" });
    expect(upd.data.password).toMatch(/^\$2[aby]\$12\$/);
    expect(upd.data.passwordChangedAt).toBeInstanceOf(Date);
    expect(mocks.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1", emailVerified: null } }),
    );
    expect(mocks.prt.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", id: { not: "t1" } } });
  });

  it.each([
    ["unknown token", null],
    ["expired token", { ...good, expiresAt: new Date(Date.now() - 1000) }],
    ["used token", { ...good, usedAt: new Date() }],
  ])("rejects %s with the generic message", async (_n, rec) => {
    mocks.prt.findUnique.mockResolvedValueOnce(rec);
    const r = await reset(req({ token, password: "new-password-1" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: MSG });
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("rejects a malformed token with the same message and a lost race on reuse", async () => {
    const r = await reset(req({ token: "nope", password: "new-password-1" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: MSG });
    mocks.prt.findUnique.mockResolvedValueOnce(good);
    mocks.prt.updateMany.mockResolvedValueOnce({ count: 0 });
    const r2 = await reset(req({ token, password: "new-password-1" }));
    expect(r2.status).toBe(400);
    expect(await r2.json()).toEqual({ error: MSG });
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("400 for short or oversized passwords and malformed JSON", async () => {
    expect((await reset(req({ token, password: "short" }))).status).toBe(400);
    expect((await reset(req({ token, password: "x".repeat(73) }))).status).toBe(400);
    expect((await reset(req("oops", true))).status).toBe(400);
  });

  it("429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 7 });
    const r = await reset(req({ token, password: "new-password-1" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("7");
    expect(mocks.rateLimit).toHaveBeenCalledWith("reset:ip:1.2.3.4", 10, 900000);
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("identical bodies for unverified, verified and unknown; sends only for unverified", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", emailVerified: null });
    const a = await resend(req({ email: "A@x.co" }));
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u2", email: "b@x.co", name: "B", emailVerified: new Date() });
    const b = await resend(req({ email: "b@x.co" }));
    mocks.user.findFirst.mockResolvedValueOnce(null);
    const c = await resend(req({ email: "c@x.co" }));
    expect(a.status).toBe(200);
    const bodies = [await a.json(), await b.json(), await c.json()];
    expect(bodies[0]).toEqual({ ok: true });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0][0]).toMatchObject({ event: "auth.verify", template: "verification", recipient: "a@x.co", subjectId: "u1" });
    expect(mocks.vt.deleteMany).toHaveBeenCalledWith({ where: { email: "a@x.co" } });
    const data = mocks.vt.create.mock.calls[0][0].data;
    expect(data.token).toBe(tokenOf(mocks.notify.mock.calls[0][0]));
    const ttl = data.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
  });

  it("400 on bad input, 429 when limited with proper limits", async () => {
    expect((await resend(req("{", true))).status).toBe(400);
    expect((await resend(req({ email: "x" }))).status).toBe(400);
    mocks.user.findFirst.mockResolvedValue(null);
    await resend(req({ email: "a@x.co" }));
    expect(mocks.rateLimit).toHaveBeenCalledWith("resend:ip:1.2.3.4", 5, 900000);
    expect(mocks.rateLimit).toHaveBeenCalledWith("resend:email:a@x.co", 3, 3600000);
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 9 });
    const r = await resend(req({ email: "a@x.co" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("9");
  });

  it("short cooldown: no new email while the newest link is under a minute old", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", emailVerified: null });
    mocks.vt.findFirst.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 10_000) });
    const r = await resend(req({ email: "a@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.vt.deleteMany).not.toHaveBeenCalled();
    // an older link does not block a resend
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", emailVerified: null });
    mocks.vt.findFirst.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 120_000) });
    await resend(req({ email: "a@x.co" }));
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("still 200 when sending fails", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "a@x.co", name: "A", emailVerified: null });
    mocks.notify.mockRejectedValueOnce(new Error("down"));
    expect((await resend(req({ email: "a@x.co" }))).status).toBe(200);
  });
});
