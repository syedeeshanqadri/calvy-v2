import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// "Verify your email to continue": gateway changes, WhatsApp connection, data exports and manager-level team access are refused for an owner whose
// email is not verified. The gateway / WhatsApp / export checks live in proxy.ts, in front of the routes, so no gateway or billing file is touched.

const token = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => token.current) }));
vi.mock("next-auth/middleware", () => ({ withAuth: () => () => new Response(null) }));
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, teamMember: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, staff: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));

import proxy from "@/proxy";
import { verifyGateForApi, isManagerLike, VERIFY_CODE } from "@/lib/verification";

const req = (method: string, path: string) => new NextRequest(`http://localhost${path}`, { method, headers: { host: "localhost" } });
beforeEach(() => { vi.clearAllMocks(); token.current = null; });

describe("which requests are gated", () => {
  it("gateway writes, WhatsApp writes and data exports; reads of settings stay open", () => {
    expect(verifyGateForApi("POST", "/api/settings/gateways")).toBe("gateway");
    expect(verifyGateForApi("PATCH", "/api/settings/gateways/abc")).toBe("gateway");
    expect(verifyGateForApi("POST", "/api/settings/gateways/abc/verify")).toBe("gateway");
    expect(verifyGateForApi("GET", "/api/settings/gateways")).toBeNull();
    expect(verifyGateForApi("POST", "/api/settings/whatsapp/embedded")).toBe("whatsapp");
    expect(verifyGateForApi("PUT", "/api/settings/whatsapp")).toBe("whatsapp");
    expect(verifyGateForApi("GET", "/api/settings/whatsapp")).toBeNull();
    for (const p of ["appointments", "clients", "payments"]) expect(verifyGateForApi("GET", `/api/${p}/export`)).toBe("export");
    expect(verifyGateForApi("POST", "/api/appointments")).toBeNull();
    expect(verifyGateForApi("POST", "/api/settings/payments")).toBeNull();
  });
  it("manager-level team access: by role name or by sensitive permissions", () => {
    expect(isManagerLike(["appointments.view_own"], "Stylist")).toBe(false);
    expect(isManagerLike(["appointments.view_own"], "Branch Manager")).toBe(true);
    expect(isManagerLike(["customers.export"], "Front desk")).toBe(true);
    expect(isManagerLike(["reports.view"], null)).toBe(true);
    expect(isManagerLike([], "Owner")).toBe(true);
  });
});

describe("the proxy refuses a gated request from an unverified owner, with an inline-able 403", () => {
  it("unverified: 403 EMAIL_NOT_VERIFIED on each gate", async () => {
    token.current = { uid: "u1", ev: false };
    db.user.findUnique.mockResolvedValue({ emailVerified: null });
    for (const [m, p, gate] of [["POST", "/api/settings/gateways", "gateway"], ["POST", "/api/settings/whatsapp/embedded", "whatsapp"], ["GET", "/api/clients/export", "export"]] as const) {
      const res = (await proxy(req(m, p)))!;
      expect(res.status, p).toBe(403);
      expect(await res.json()).toMatchObject({ code: VERIFY_CODE, gate });
    }
  });
  it("a stale token that still says unverified is checked against the database: verified since, so it passes", async () => {
    token.current = { uid: "u1", ev: false };
    db.user.findUnique.mockResolvedValue({ emailVerified: new Date() });
    expect((await proxy(req("POST", "/api/settings/gateways")))?.status).not.toBe(403);
  });
  it("verified owners (ev true or absent), customers and ungated paths are not affected, and verified owners cost no lookup", async () => {
    for (const t of [{ uid: "u1", ev: true }, { uid: "u1" }]) { token.current = t; expect((await proxy(req("POST", "/api/settings/gateways")))?.status).not.toBe(403); }
    token.current = { uid: "u1", ev: false };
    db.user.findUnique.mockResolvedValue({ emailVerified: null });
    expect((await proxy(req("POST", "/api/settings/payments")))?.status).not.toBe(403);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
