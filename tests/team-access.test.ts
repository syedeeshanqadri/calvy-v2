import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// requirePermission-style gate against a mocked database: revoke is immediate, members are scoped,
// the export API refuses without the permission, an invite works once and not after expiry.

const session = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({
  teamMember: { findUnique: vi.fn(), update: vi.fn() },
  teamInvite: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { create: vi.fn() },
  client: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/csvExport", async () => ({ ...(await vi.importActual<object>("@/lib/csvExport")), guardCsvExport: vi.fn(async () => null) }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: vi.fn() }));

import { accessSession, appointmentWhere, pageAccess, resolveAccess } from "@/lib/access";
import { ForbiddenError } from "@/lib/permissions";
import { GET as exportClients } from "@/app/api/clients/export/route";
import { POST as createClient } from "@/app/api/clients/route";
import { PATCH as patchMember } from "@/app/api/team/[id]/route";
import { POST as inviteMember } from "@/app/api/team/route";
import { acceptInvite } from "@/lib/teamDb";
import { createInviteToken } from "@/lib/teamInvite";

const memberSession = { user: { id: "u-member", name: "Rita", email: "r@x.co" }, expires: "" };
const ownerSession = { user: { id: "u-owner", businessId: "biz1" }, expires: "" };
const member = (permissions: string[], extra: object = {}) => ({ id: "m1", businessId: "biz1", userId: "u-member", roleName: "Receptionist", permissions, staffId: null, ...extra });
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init);

beforeEach(() => { vi.clearAllMocks(); session.current = memberSession; });

describe("access is read from the database on every request", () => {
  it("allows a ticked permission, denies an unticked one", async () => {
    db.teamMember.findUnique.mockResolvedValue(member(["customers.view"]));
    expect((await accessSession("customers.view"))?.user.businessId).toBe("biz1");
    await expect(accessSession("customers.export")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("revoking a permission denies the very next request, with the same session", async () => {
    db.teamMember.findUnique.mockResolvedValueOnce(member(["customers.export"]));
    expect(await accessSession("customers.export")).not.toBeNull();
    db.teamMember.findUnique.mockResolvedValueOnce(member([]));
    await expect(accessSession("customers.export")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("removing a member kills their session: nothing resolves, pages redirect to login", async () => {
    db.teamMember.findUnique.mockResolvedValue(null);
    expect(await accessSession("customers.view")).toBeNull();
    expect(await resolveAccess(session.current as never)).toBeNull();
    await expect(pageAccess("customers.view")).rejects.toThrow("REDIRECT:/login");
  });
  it("a page without permission sends the member back to the dashboard", async () => {
    db.teamMember.findUnique.mockResolvedValue(member(["customers.view"]));
    await expect(pageAccess("services.manage")).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("owner-only: a member never passes, the owner always does", async () => {
    db.teamMember.findUnique.mockResolvedValue(member(["customers.view"]));
    await expect(accessSession("owner")).rejects.toBeInstanceOf(ForbiddenError);
    session.current = ownerSession;
    expect((await accessSession("owner"))?.access.isOwner).toBe(true);
  });
  it("a signed-in customer or a stranger has no access", async () => {
    session.current = { user: { id: "c1", kind: "customer" }, expires: "" };
    expect(await accessSession("customers.view")).toBeNull();
    session.current = null;
    expect(await accessSession()).toBeNull();
  });
  it("own-only appointments are scoped to the linked staff record, all-access is not", async () => {
    db.teamMember.findUnique.mockResolvedValueOnce(member(["appointments.view_own"], { staffId: "s1" }));
    expect(appointmentWhere((await accessSession("appointments.view_own"))!.access)).toEqual({ staffId: "s1" });
    db.teamMember.findUnique.mockResolvedValueOnce(member(["appointments.view_own"], { staffId: null }));
    expect(appointmentWhere((await accessSession("appointments.view_own"))!.access)).toEqual({ staffId: "__none__" });
    db.teamMember.findUnique.mockResolvedValueOnce(member(["appointments.view_all"]));
    expect(appointmentWhere((await accessSession("appointments.view_all"))!.access)).toEqual({});
  });
});

describe("API routes enforce on the server", () => {
  it("customer export: 403 without 'Customers export', CSV with it", async () => {
    db.teamMember.findUnique.mockResolvedValue(member(["customers.view", "customers.edit"]));
    const denied = await exportClients();
    expect(denied.status).toBe(403);
    expect(db.client.findMany).not.toHaveBeenCalled();

    db.teamMember.findUnique.mockResolvedValue(member(["customers.export"]));
    db.client.findMany.mockResolvedValue([]);
    const ok = await exportClients();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
    expect(db.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: "biz1" } }));
  });
  it("creating a customer needs 'Customers edit'", async () => {
    db.teamMember.findUnique.mockResolvedValue(member(["customers.view"]));
    const res = await createClient(req("/api/clients", { method: "POST", body: JSON.stringify({ name: "A" }) }));
    expect(res.status).toBe(403);
  });
  it("members cannot change permissions (team routes are owner-only) and get 403", async () => {
    db.teamMember.findUnique.mockResolvedValue(member([...["customers.view"]]));
    const res = await patchMember(req("/api/team/m1", { method: "PATCH", body: JSON.stringify({ permissions: ["customers.export"] }) }), { params: Promise.resolve({ id: "m1" }) });
    expect(res.status).toBe(403);
    const add = await inviteMember(req("/api/team", { method: "POST", body: "{}" }));
    expect(add.status).toBe(403);
  });
});

describe("invite redemption", () => {
  const stored = (over: object = {}) => {
    const { token, tokenHash, expiresAt } = createInviteToken();
    return { token, rec: { id: "i1", tokenHash, expiresAt, usedAt: null, revokedAt: null, member: { id: "m1", name: "Rita", email: "r@x.co", userId: null }, ...over } };
  };
  const tx = () => ({
    teamInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { create: vi.fn().mockResolvedValue({ id: "u9" }) },
    teamMember: { update: vi.fn() },
  });

  it("works once: the claim is atomic, a second use finds it claimed", async () => {
    const { token, rec } = stored();
    db.teamInvite.findUnique.mockResolvedValue(rec);
    const t = tx();
    db.$transaction.mockImplementation(async (fn: (x: unknown) => unknown) => fn(t));
    expect(await acceptInvite(token, "correct horse battery")).toEqual({ ok: true });
    expect(t.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "r@x.co", role: "member" }) });
    expect(t.user.create.mock.calls[0][0].data.password).not.toBe("correct horse battery");

    const t2 = tx();
    t2.teamInvite.updateMany.mockResolvedValue({ count: 0 });
    db.$transaction.mockImplementation(async (fn: (x: unknown) => unknown) => fn(t2));
    expect(await acceptInvite(token, "correct horse battery")).toEqual({ ok: false });
    expect(t2.user.create).not.toHaveBeenCalled();
  });
  it("is refused when expired, used, revoked, unknown or already linked", async () => {
    const past = new Date(Date.now() - 1000);
    for (const over of [{ expiresAt: past }, { usedAt: new Date() }, { revokedAt: new Date() }]) {
      const { token, rec } = stored(over);
      db.teamInvite.findUnique.mockResolvedValue(rec);
      expect(await acceptInvite(token, "correct horse battery")).toEqual({ ok: false });
    }
    db.teamInvite.findUnique.mockResolvedValue(null);
    expect(await acceptInvite("0".repeat(64), "correct horse battery")).toEqual({ ok: false });
    const { token, rec } = stored({ member: { id: "m1", name: "R", email: "r@x.co", userId: "u1" } });
    db.teamInvite.findUnique.mockResolvedValue(rec);
    expect(await acceptInvite(token, "correct horse battery")).toEqual({ ok: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
