import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { PERMISSIONS, PRESETS, appointmentScope, can, pathAllowed, sanitizePermissions } from "@/lib/permissions";
import { INVITE_TTL_MS, createInviteToken, isUsableInvite } from "@/lib/teamInvite";
import { hashToken } from "@/lib/auth-tokens";
import { PLAN_LIMITS, applyEnforcement } from "@/lib/plans";
import { evaluateLimit } from "@/lib/limits";

describe("permission helper: route groups", () => {
  const rec = ["appointments.view_all", "appointments.write", "customers.view"];
  it("opens only the pages a ticked permission covers", () => {
    expect(pathAllowed(rec, "/dashboard/appointments")).toBe(true);
    expect(pathAllowed(rec, "/dashboard/clients")).toBe(true);
    expect(pathAllowed(rec, "/dashboard/clients/abc")).toBe(true);
    expect(pathAllowed(rec, "/dashboard/services")).toBe(false);
    expect(pathAllowed(rec, "/dashboard/queue")).toBe(false);
    expect(pathAllowed(rec, "/dashboard/website")).toBe(false);
    expect(pathAllowed(rec, "/dashboard/analytics")).toBe(false);
  });
  it("owner-only areas are never reachable, whatever is ticked", () => {
    for (const p of ["/dashboard/billing", "/dashboard/wallet", "/dashboard/payments", "/dashboard/settings", "/dashboard/settings/team", "/dashboard/staff", "/dashboard/support", "/admin", "/crm"]) {
      expect(pathAllowed([...PERMISSIONS], p), p).toBe(false);
    }
  });
  it("the dashboard landing page is always open and a prefix match cannot be tricked", () => {
    expect(pathAllowed([], "/dashboard")).toBe(true);
    expect(pathAllowed([...PERMISSIONS], "/dashboard/appointments-evil")).toBe(false);
  });
  it("notification settings need their own permission", () => {
    expect(pathAllowed(["notifications.settings"], "/dashboard/settings/notifications")).toBe(true);
    expect(pathAllowed(["reviews.settings"], "/dashboard/settings/notifications")).toBe(false);
  });
  it("can() accepts any of several permissions", () => {
    expect(can(["customers.view"], ["customers.export", "customers.view"])).toBe(true);
    expect(can(["customers.view"], "customers.export")).toBe(false);
  });
  it("owner-only keys cannot be ticked: unknown keys are dropped", () => {
    expect(sanitizePermissions(["billing", "team.manage", "customers.view", "customers.view", 5])).toEqual(["customers.view"]);
  });
  it("presets only name real permissions", () => {
    for (const p of Object.values(PRESETS)) expect(sanitizePermissions(p.permissions)).toEqual(p.permissions);
    expect(PRESETS.receptionist.permissions).not.toContain("customers.export");
  });
});

describe("own-only appointment scoping", () => {
  it("view_all wins, own-only needs the linked staff id, nothing ticked sees nothing", () => {
    expect(appointmentScope(["appointments.view_all", "appointments.view_own"], "s1")).toEqual({ kind: "all" });
    expect(appointmentScope(["appointments.view_own"], "s1")).toEqual({ kind: "own", staffId: "s1" });
    expect(appointmentScope(["appointments.view_own"], null)).toEqual({ kind: "own", staffId: null });
    expect(appointmentScope(["customers.view"], "s1")).toEqual({ kind: "none" });
  });
});

describe("invite token", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  it("is random, stored hashed, and expires in 48 hours", () => {
    const a = createInviteToken(now), b = createInviteToken(now);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.expiresAt.getTime() - now.getTime()).toBe(INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(48 * 3600_000);
  });
  it("is unusable once expired, used or revoked", () => {
    const base = { expiresAt: new Date(now.getTime() + 1000), usedAt: null, revokedAt: null };
    expect(isUsableInvite(base, now)).toBe(true);
    expect(isUsableInvite({ ...base, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(isUsableInvite({ ...base, usedAt: now }, now)).toBe(false);
    expect(isUsableInvite({ ...base, revokedAt: now }, now)).toBe(false);
    expect(isUsableInvite(null, now)).toBe(false);
  });
});

describe("team plan limits", () => {
  it("Free = 0, Mid = 3, Top = 10", () => {
    expect(PLAN_LIMITS.free.maxTeamMembers).toBe(0);
    expect(PLAN_LIMITS.professional.maxTeamMembers).toBe(3);
    expect(PLAN_LIMITS.business.maxTeamMembers).toBe(10);
  });
  it("with enforcement ON the limit applies; with it OFF nothing is capped", () => {
    const on = (p: keyof typeof PLAN_LIMITS) => applyEnforcement(PLAN_LIMITS[p], true);
    expect(evaluateLimit(on("free"), "team", 0)?.code).toBe("FEATURE_LOCKED");
    expect(evaluateLimit(on("professional"), "team", 2)).toBeNull();
    expect(evaluateLimit(on("professional"), "team", 3)?.code).toBe("LIMIT_REACHED");
    expect(evaluateLimit(on("business"), "team", 10)?.code).toBe("LIMIT_REACHED");
    expect(evaluateLimit(applyEnforcement(PLAN_LIMITS.free, false), "team", 50)).toBeNull();
  });
});
