import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Adding a team member with manager-level access needs a verified owner; an ordinary member does not.

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  teamMember: { findUnique: vi.fn(), create: vi.fn(async () => ({ id: "m1", email: "m@x.co", name: "M", roleName: "Stylist", permissions: [], staffId: null, userId: null, createdAt: new Date() })) },
  staff: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/access", () => ({ accessSession: vi.fn(async () => ({ user: { id: "o1", businessId: "b1" }, access: { isOwner: true } })) }));
vi.mock("@/lib/limits", () => ({ checkLimit: vi.fn(async () => null), denialResponse: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/teamDb", () => ({ issueInvite: vi.fn(async () => "tok"), serializeMember: (m: unknown) => m }));
vi.mock("@/lib/auth-http", async (orig) => ({ ...(await orig<object>()), appBaseUrl: () => "http://localhost", testTokenHookEnabled: () => false }));

import { POST } from "@/app/api/team/route";

const post = (body: unknown) => new NextRequest("http://localhost/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const base = { name: "Mina", email: "mina@x.co", staffId: null };
beforeEach(() => { vi.clearAllMocks(); db.user.findFirst.mockResolvedValue(null); db.teamMember.findUnique.mockResolvedValue(null); });

describe("team member creation and email verification", () => {
  it("manager-level access from an unverified owner: 403 EMAIL_NOT_VERIFIED, nothing created", async () => {
    db.user.findUnique.mockResolvedValue({ emailVerified: null });
    const res = await POST(post({ ...base, roleName: "Manager", permissions: ["reports.view", "appointments.view_all"] }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED", gate: "team" });
    expect(db.teamMember.create).not.toHaveBeenCalled();
  });
  it("a verified owner can add a manager", async () => {
    db.user.findUnique.mockResolvedValue({ emailVerified: new Date() });
    const res = await POST(post({ ...base, roleName: "Manager", permissions: ["reports.view"] }));
    expect(res.status).not.toBe(403);
  });
  it("an ordinary member (no manager role, no sensitive permission) needs no verification", async () => {
    db.user.findUnique.mockResolvedValue({ emailVerified: null });
    const res = await POST(post({ ...base, roleName: "Stylist", permissions: ["appointments.view_own"] }));
    expect(res.status).not.toBe(403);
  });
});
