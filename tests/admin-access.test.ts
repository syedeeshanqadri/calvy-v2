import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// The admin area: 404 for everyone who is not a super admin, 2FA, 30-minute idle, re-auth, view-as (read-only enforced
// on the server, expiry), act-as logging, and the rule that nothing can promote or edit the audit log.

const jar = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn(), deleted: [] as string[] }));
const session = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  adminSession: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  adminAuditLog: { create: vi.fn(async () => ({ id: "audit1" })) },
  auditLog: { create: vi.fn() },
  business: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({})) },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.values.has(n) ? { value: jar.values.get(n) } : undefined), set: (n: string, v: string) => { jar.set(n, v); jar.values.set(n, v); }, delete: (n: string) => { jar.deleted.push(n); jar.values.delete(n); } }) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));

import { ADMIN_COOKIE, ADMIN_IDLE_MS, REAUTH_WINDOW_MS, adminState, cleanReason, hashToken, needsReauth, requireAdminApi, requireAdminPage } from "@/lib/admin/auth";
import { adminWriteGate, recordAdminWrite, viewAsBlock } from "@/lib/admin/guard";
import { base32Decode, findRecoveryCode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, totpAt, verifyTotp } from "@/lib/admin/totp";
import { encryptSecret } from "@/lib/notifications/secret";
import { POST as verify2fa } from "@/app/api/admin/2fa/verify/route";
import { POST as startViewAs } from "@/app/api/admin/view-as/route";
import { POST as exitViewAs } from "@/app/api/admin/view-as/exit/route";
import { POST as businessAction } from "@/app/api/admin/businesses/[id]/route";
import { PUT as putLimits } from "@/app/api/admin/settings/limits/route";

process.env.NEXTAUTH_SECRET = "test-secret";
const ME = { id: "a1", email: "admin@calvy.test", name: "Admin" };
const TOKEN = "t".repeat(64);
const NOW = Date.now();
const asAdmin = (over: Record<string, unknown> = {}) => { session.current = { user: { id: ME.id, email: ME.email } }; db.user.findUnique.mockResolvedValue({ ...ME, isSuperAdmin: true, adminTotpEnabledAt: new Date(), ...over }); };
const liveSession = (over: Record<string, unknown> = {}) => {
  jar.values.set(ADMIN_COOKIE, TOKEN);
  db.adminSession.findUnique.mockResolvedValue({ id: "s1", userId: ME.id, tokenHash: hashToken(TOKEN), createdAt: new Date(NOW - 60_000), lastSeenAt: new Date(NOW - 5_000), reauthAt: new Date(NOW - 60_000), endedAt: null, viewAsBusinessId: null, viewAsMode: null, viewAsReason: null, viewAsStartedAt: null, viewAsExpiresAt: null, viewAsAuditId: null, ...over });
};
const post = (url: string, body: unknown, method = "POST") => new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${TOKEN}` }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks(); jar.values.clear(); jar.deleted.length = 0; session.current = null;
  db.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(db));
  db.adminAuditLog.create.mockResolvedValue({ id: "audit1" });
  db.adminSession.updateMany.mockResolvedValue({ count: 1 });
  db.adminSession.update.mockResolvedValue({});
  db.user.update.mockResolvedValue({});
});

describe("who can reach the admin area", () => {
  it("a guest, a normal owner and a customer all get the 404 (pages and APIs)", async () => {
    for (const s of [null, { user: { id: "u1", businessId: "b1" } }, { user: { id: "c1", kind: "customer", customerId: "c1" } }]) {
      session.current = s;
      db.user.findUnique.mockResolvedValue({ id: "u1", isSuperAdmin: false });
      await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
      const api = await requireAdminApi();
      expect(api.ok).toBe(false);
      if (!api.ok) expect(api.res.status).toBe(404);
    }
  });
  it("a super admin without an authenticator session is sent to 2FA (pages) or gets 401 ADMIN_2FA_REQUIRED (APIs)", async () => {
    asAdmin();
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/admin/2fa");
    const api = await requireAdminApi();
    expect(api.ok).toBe(false);
    if (!api.ok) { expect(api.res.status).toBe(401); expect((await api.res.json()).code).toBe("ADMIN_2FA_REQUIRED"); }
  });
  it("every admin API route returns 404 to a non-admin", async () => {
    session.current = { user: { id: "u1", businessId: "b1" } };
    db.user.findUnique.mockResolvedValue({ id: "u1", isSuperAdmin: false });
    const ctx = { params: Promise.resolve({ id: "b1" }) };
    for (const res of [
      await businessAction(post("/api/admin/businesses/b1", { action: "suspend", reason: "long enough reason" }), ctx),
      await startViewAs(post("/api/admin/view-as", { businessId: "b1", mode: "READ", reason: "long enough reason" })),
      await exitViewAs(),
      await putLimits(post("/api/admin/settings/limits", { maxUpcomingPerBusiness: 6, maxNewPer24h: 5, reason: "long enough reason" }, "PUT")),
    ]) expect(res.status).toBe(404);
    // the 2FA endpoints answer 404 too, so they do not reveal that /admin exists
    expect((await verify2fa(post("/api/admin/2fa/verify", { code: "123456" }))).status).toBe(404);
  });
  it("the flag comes from the database on every call: a demoted admin loses access at once", async () => {
    asAdmin(); liveSession();
    expect((await adminState()).state).toBe("ok");
    db.user.findUnique.mockResolvedValue({ ...ME, isSuperAdmin: false });
    expect((await adminState()).state).toBe("none");
  });
  it("static check: every admin page, admin API and CRM route goes through the one admin helper", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/(page|route)\.tsx?$/.test(n)) files.push(p); } };
    for (const d of ["app/admin", "app/api/admin", "app/api/crm", "app/crm"]) walk(d);
    const exempt = [/app\/admin\/2fa\/page\.tsx$/, /api\/admin\/logout\/route\.ts$/, /api\/admin\/2fa\//, /app\/admin\/settings\/page\.tsx$/];
    const missing = files.filter((f) => !exempt.some((e) => e.test(f))).filter((f) => !/requireAdmin(Page|Api)/.test(readFileSync(f, "utf8")));
    // settings/page.tsx is covered below; it must use the helper as well
    expect(readFileSync("app/admin/settings/page.tsx", "utf8")).toContain("requireAdminPage");
    expect(missing).toEqual([]);
  });
  it("nothing in the app can make someone a super admin (only the script can)", () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === "node_modules" || n === ".next") continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && /data:\s*\{[^}]*isSuperAdmin\s*:\s*true/.test(readFileSync(p, "utf8"))) hits.push(p); } };
    for (const d of ["app", "lib", "components"]) walk(d);
    expect(hits).toEqual([]);
  });
  it("the admin audit log has no update or delete code path, and the database refuses both", () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === "node_modules" || n === ".next") continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && /adminAuditLog\.(update|updateMany|delete|deleteMany|upsert)/.test(readFileSync(p, "utf8"))) hits.push(p); } };
    for (const d of ["app", "lib", "scripts"]) walk(d);
    expect(hits).toEqual([]);
    const sql = readFileSync("prisma/migrations/20261110120000_admin_panel/migration.sql", "utf8");
    expect(sql).toMatch(/BEFORE UPDATE ON "AdminAuditLog"/);
    expect(sql).toMatch(/BEFORE DELETE ON "AdminAuditLog"/);
    expect(sql).toMatch(/BEFORE TRUNCATE ON "AdminAuditLog"/);
  });
});

describe("authenticator codes (2FA)", () => {
  it("matches the RFC 6238 test vector and accepts one step of clock drift", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"
    expect(Buffer.from(base32Decode(secret)).toString()).toBe("12345678901234567890");
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    const s = generateTotpSecret();
    const now = Date.UTC(2026, 10, 10, 12, 0, 0);
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(s, totpAt(s, step), now)).toBe(step);
    expect(verifyTotp(s, totpAt(s, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(s, totpAt(s, step - 3), now)).toBeNull();
    expect(verifyTotp(s, "12345", now)).toBeNull();
  });
  it("a code works once: the step that was used is refused again", () => {
    const s = generateTotpSecret(); const now = Date.now(); const step = Math.floor(now / 30_000);
    expect(verifyTotp(s, totpAt(s, step), now, step)).toBeNull();
    expect(verifyTotp(s, totpAt(s, step), now, step - 1)).toBe(step);
  });
  it("recovery codes are random, found by hash, and never stored in clear", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    const hashes = codes.map(hashRecoveryCode);
    expect(hashes.some((h, i) => h === codes[i])).toBe(false);
    expect(findRecoveryCode(hashes, codes[3].toUpperCase().replace("-", " "))).toBe(3);
    expect(findRecoveryCode(hashes, "nope-nope")).toBe(-1);
  });
  it("signing in needs a right code; a wrong one is refused and logged, a right one starts the session", async () => {
    const secret = generateTotpSecret();
    asAdmin({ adminTotpSecret: encryptSecret(secret), adminTotpLastStep: null, adminRecoveryHashes: [] });
    const wrong = await verify2fa(post("/api/admin/2fa/verify", { code: "000000" }));
    expect(wrong.status).toBe(400);
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "2fa.failed" }) }));
    expect(jar.set).not.toHaveBeenCalled();
    const right = await verify2fa(post("/api/admin/2fa/verify", { code: totpAt(secret, Math.floor(Date.now() / 30_000)) }));
    expect(right.status).toBe(200);
    expect(jar.set).toHaveBeenCalledWith(ADMIN_COOKIE, expect.any(String));
    expect(db.adminSession.create).toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { adminTotpLastStep: expect.any(Number) } }));
  });
  it("a recovery code signs in once and is removed", async () => {
    const codes = generateRecoveryCodes(2);
    asAdmin({ adminTotpSecret: encryptSecret(generateTotpSecret()), adminTotpLastStep: null, adminRecoveryHashes: codes.map(hashRecoveryCode) });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await verify2fa(post("/api/admin/2fa/verify", { recoveryCode: codes[0] }));
    expect(res.status).toBe(200);
    expect(db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { adminRecoveryHashes: [hashRecoveryCode(codes[1])] } }));
    db.user.updateMany.mockResolvedValue({ count: 0 }); // a parallel request already spent it
    expect((await verify2fa(post("/api/admin/2fa/verify", { recoveryCode: codes[0] }))).status).toBe(400);
  });
});

describe("admin session: 30 minutes idle, 5 minute re-auth", () => {
  it("is valid inside 30 idle minutes and ends after them", async () => {
    asAdmin(); liveSession({ lastSeenAt: new Date(NOW - (ADMIN_IDLE_MS - 60_000)) });
    expect((await adminState(new Date(NOW))).state).toBe("ok");
    liveSession({ lastSeenAt: new Date(NOW - (ADMIN_IDLE_MS + 60_000)) });
    expect((await adminState(new Date(NOW))).state).toBe("needs2fa");
    expect(db.adminSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: { endedAt: expect.any(Date) } }));
  });
  it("an ended session, or someone else's cookie, is not a session", async () => {
    asAdmin(); liveSession({ endedAt: new Date() });
    expect((await adminState(new Date(NOW))).state).toBe("needs2fa");
    liveSession({ userId: "someone-else" });
    expect((await adminState(new Date(NOW))).state).toBe("needs2fa");
  });
  it("sensitive actions need a fresh code: refused with 428 after 5 minutes, allowed inside them", () => {
    const ctx = (ageMs: number) => ({ user: { ...ME }, sessionId: "s1", reauthAt: new Date(NOW - ageMs), viewAs: null });
    expect(needsReauth(ctx(REAUTH_WINDOW_MS - 1000), new Date(NOW))).toBeNull();
    expect(needsReauth(ctx(REAUTH_WINDOW_MS + 1000), new Date(NOW))?.status).toBe(428);
  });
  it("a reason must be real: at least 8 characters", () => {
    expect(cleanReason("fix")).toBeNull();
    expect(cleanReason("  Support ticket 123  ")).toBe("Support ticket 123");
  });
  it("an action API refuses (428) when the last code is older than 5 minutes", async () => {
    asAdmin(); liveSession({ reauthAt: new Date(Date.now() - 6 * 60_000) });
    const res = await businessAction(post("/api/admin/businesses/b1", { action: "suspend", reason: "Chargeback investigation" }), { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(428);
  });
});

describe("view-as", () => {
  const active = (mode: "READ" | "ACT", over: Record<string, unknown> = {}) => liveSession({ viewAsBusinessId: "b1", viewAsMode: mode, viewAsReason: "Support ticket 123", viewAsStartedAt: new Date(Date.now() - 60_000), viewAsExpiresAt: new Date(Date.now() + 20 * 60_000), viewAsAuditId: "audit0", ...over });

  it("needs a written reason, and ACT also needs a fresh code", async () => {
    asAdmin(); liveSession({ reauthAt: new Date(Date.now() - 10 * 60_000) });
    db.business.findUnique.mockResolvedValue({ id: "b1", name: "Glow" });
    expect((await startViewAs(post("/api/admin/view-as", { businessId: "b1", mode: "READ", reason: "no" }))).status).toBe(400);
    expect((await startViewAs(post("/api/admin/view-as", { businessId: "b1", mode: "ACT", reason: "Owner asked us to fix hours" }))).status).toBe(428);
    expect((await startViewAs(post("/api/admin/view-as", { businessId: "b1", mode: "READ", reason: "Support ticket 123" }))).status).toBe(200);
  });
  it("starting writes the reason to the admin audit log and expires in 30 minutes", async () => {
    asAdmin(); liveSession();
    db.business.findUnique.mockResolvedValue({ id: "b1", name: "Glow" });
    const res = await startViewAs(post("/api/admin/view-as", { businessId: "b1", mode: "READ", reason: "Support ticket 123" }));
    expect(res.status).toBe(200);
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "view_as.start", businessId: "b1", reason: "Support ticket 123" }) }));
    const upd = db.adminSession.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ viewAsBusinessId: "b1", viewAsMode: "READ" });
    expect(upd.viewAsExpiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(upd.viewAsExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  });
  it("a second view-as cannot start before the first is exited (blocked while read-only, 409 while acting)", async () => {
    db.business.findUnique.mockResolvedValue({ id: "b2", name: "Other" });
    asAdmin(); active("READ");
    expect((await startViewAs(post("/api/admin/view-as", { businessId: "b2", mode: "READ", reason: "Support ticket 456" }))).status).toBe(403);
    active("ACT");
    expect((await startViewAs(post("/api/admin/view-as", { businessId: "b2", mode: "READ", reason: "Support ticket 456" }))).status).toBe(409);
  });
  it("expiry ends it, and the lapse is written to the audit log once", async () => {
    asAdmin(); active("READ", { viewAsExpiresAt: new Date(NOW - 1000) });
    db.adminSession.findUnique.mockResolvedValue({ id: "s1", userId: ME.id, tokenHash: hashToken(TOKEN), createdAt: new Date(NOW - 3_600_000), lastSeenAt: new Date(NOW - 5000), reauthAt: new Date(NOW), endedAt: null, viewAsBusinessId: "b1", viewAsMode: "READ", viewAsReason: "Support ticket 123", viewAsStartedAt: new Date(NOW - 31 * 60_000), viewAsExpiresAt: new Date(NOW - 1000), viewAsAuditId: "audit0" });
    const st = await adminState(new Date(NOW));
    expect(st.state === "ok" && st.ctx.viewAs).toBeNull();
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "view_as.expired", businessId: "b1" }) }));
  });
  it("READ blocks every write on the server; Exit, logout and re-auth still work; reads are untouched", async () => {
    asAdmin(); active("READ");
    for (const [method, path] of [["POST", "/api/services"], ["PATCH", "/api/appointments/a1"], ["DELETE", "/api/staff/s1"], ["PUT", "/api/settings"]] as const) {
      const g = await adminWriteGate(new Request(`http://localhost${path}`, { method, headers: { cookie: `${ADMIN_COOKIE}=${TOKEN}` } }));
      expect("block" in g && g.block.status).toBe(403);
    }
    for (const path of ["/api/admin/view-as/exit", "/api/admin/logout", "/api/admin/2fa/reauth"]) {
      const g = await adminWriteGate(new Request(`http://localhost${path}`, { method: "POST", headers: { cookie: `${ADMIN_COOKIE}=${TOKEN}` } }));
      expect("block" in g).toBe(false);
    }
    const get = await adminWriteGate(new Request("http://localhost/api/services", { method: "GET", headers: { cookie: `${ADMIN_COOKIE}=${TOKEN}` } }));
    expect("block" in get).toBe(false);
  });
  it("the same rule runs in front of EVERY route (proxy), so a handler not wrapped in safeRoute is covered too", () => {
    expect(viewAsBlock("READ", "PATCH", "/api/settings/payout")?.status).toBe(403);
    expect(viewAsBlock("READ", "POST", "/api/anything/new")?.status).toBe(403);
    expect(viewAsBlock("READ", "POST", "/api/admin/view-as/exit")).toBeNull();
    expect(viewAsBlock("READ", "POST", "/api/auth/signout")).toBeNull(); // logging out still works
    expect(viewAsBlock("READ", "GET", "/api/settings")).toBeNull();
    expect(viewAsBlock("ACT", "PATCH", "/api/settings/payout")?.status).toBe(403);
    expect(viewAsBlock("ACT", "PATCH", "/api/services/s1")).toBeNull();
    expect(viewAsBlock(undefined, "POST", "/api/services")).toBeNull();
  });
  it("static check: every write handler NOT wrapped in safeRoute is a payment/billing/webhook route that act-as can never reach", () => {
    const odd: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === "route.ts" && /export async function (POST|PATCH|PUT|DELETE)/.test(readFileSync(p, "utf8"))) odd.push(p); } };
    walk("app/api");
    const allowed = /api\/(billing|razorpay|wallet|settings\/payout|admin\/withdrawals)\//;
    expect(odd.filter((f) => !allowed.test(f))).toEqual([]);
  });
  it("an ordinary request (no admin cookie) never touches the admin code", async () => {
    const g = await adminWriteGate(new Request("http://localhost/api/services", { method: "POST" }));
    expect(g).toEqual({ trace: null });
    expect(db.adminSession.findUnique).not.toHaveBeenCalled();
  });
  it("Exit ends the view-as and writes view_as.end", async () => {
    asAdmin(); active("READ");
    db.adminSession.findUnique.mockResolvedValue({ id: "s1", userId: ME.id, tokenHash: hashToken(TOKEN), createdAt: new Date(), lastSeenAt: new Date(), reauthAt: new Date(), endedAt: null, viewAsBusinessId: "b1", viewAsMode: "READ", viewAsReason: "Support ticket 123", viewAsStartedAt: new Date(Date.now() - 5 * 60_000), viewAsExpiresAt: new Date(Date.now() + 25 * 60_000), viewAsAuditId: "audit0" });
    const res = await exitViewAs();
    expect(res.status).toBe(200);
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "view_as.end", businessId: "b1" }) }));
  });
  it("ACT mode can edit, but owner-only areas (payments, billing, team) stay closed", async () => {
    asAdmin(); active("ACT");
    const ok = await adminWriteGate(new Request("http://localhost/api/services", { method: "POST", headers: { cookie: `${ADMIN_COOKIE}=${TOKEN}` } }));
    expect("trace" in ok && ok.trace?.viewAs?.mode).toBe("ACT");
    for (const path of ["/api/settings/payout", "/api/settings/payments", "/api/billing/upgrade", "/api/team", "/api/razorpay/connect", "/api/wallet/withdraw"]) {
      const g = await adminWriteGate(new Request(`http://localhost${path}`, { method: "POST", headers: { cookie: `${ADMIN_COOKIE}=${TOKEN}` } }));
      expect("block" in g && g.block.status).toBe(403);
    }
  });
  it("every act-as edit goes in the admin audit log AND in the business's own log as \"Calvy admin\"", async () => {
    const viewAs = { businessId: "b1", mode: "ACT" as const, reason: "Owner asked us to fix hours", startedAt: new Date(), expiresAt: new Date(Date.now() + 600_000) };
    await recordAdminWrite({ ctx: { user: ME, sessionId: "s1", reauthAt: new Date(), viewAs }, method: "PATCH", path: "/api/services/svc1", viewAs }, 200);
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "act_as.edit", businessId: "b1", reason: "Owner asked us to fix hours" }) }));
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: "b1", actorId: "calvy-admin", action: "admin.edit", target: "services" }) });
    db.adminAuditLog.create.mockClear(); db.auditLog.create.mockClear();
    await recordAdminWrite({ ctx: { user: ME, sessionId: "s1", reauthAt: new Date(), viewAs }, method: "PATCH", path: "/api/services/svc1", viewAs }, 403); // a refused write is not an edit
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });
  it("other admin APIs (blog, plans, support) are audited too, except those that audit themselves", async () => {
    const ctx = { user: ME, sessionId: "s1", reauthAt: new Date(), viewAs: null };
    await recordAdminWrite({ ctx, method: "PATCH", path: "/api/admin/plans/free", viewAs: null }, 200);
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "admin.api" }) }));
    db.adminAuditLog.create.mockClear();
    await recordAdminWrite({ ctx, method: "POST", path: "/api/admin/businesses/b1", viewAs: null }, 200);
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("admin Settings: verified-customer limits", () => {
  it("need a reason and a fresh code, then save and audit before and after", async () => {
    asAdmin(); liveSession({ reauthAt: new Date(Date.now() - 10 * 60_000) });
    const body = { maxUpcomingPerBusiness: 8, maxNewPer24h: 4, reason: "Clinics asked for more room for families" };
    expect((await putLimits(post("/api/admin/settings/limits", body, "PUT"))).status).toBe(428);
    liveSession({ reauthAt: new Date() });
    expect((await putLimits(post("/api/admin/settings/limits", { ...body, reason: "no" }, "PUT"))).status).toBe(400);
    expect((await putLimits(post("/api/admin/settings/limits", { ...body, maxNewPer24h: 500 }, "PUT"))).status).toBe(400);
    expect((await putLimits(post("/api/admin/settings/limits", body, "PUT"))).status).toBe(200);
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "settings.limits_changed", reason: body.reason }) }));
    const calls = db.adminAuditLog.create.mock.calls as unknown as { data: { detail: string } }[][];
    const detail = JSON.parse(calls[calls.length - 1][0].data.detail);
    expect(detail).toEqual({ before: { maxUpcomingPerBusiness: 6, maxNewPer24h: 5 }, after: { maxUpcomingPerBusiness: 8, maxNewPer24h: 4 } });
  });
});
