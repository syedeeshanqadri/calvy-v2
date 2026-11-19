import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Step 36d: the dashboard now shares session/access lookups per request. These tests pin that nobody gets in who should not.

const db = vi.hoisted(() => ({ teamMember: { findUnique: vi.fn() }, business: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
class Redirect extends Error { constructor(public to: string) { super("redirect:" + to); } }
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); }, notFound: () => { throw new Error("notFound"); } }));

import { pageAccess, resolveAccess } from "@/lib/access";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith("page.tsx") ? [p] : []; });

beforeEach(() => { vi.clearAllMocks(); session.current = null; });

describe("every dashboard page is gated", () => {
  const pages = walk("app/dashboard");
  it("each page checks who is asking (pageAccess, or the owner's session with a redirect)", () => {
    expect(pages.length).toBeGreaterThan(15);
    for (const p of pages) {
      if (p.endsWith(join("no-access", "page.tsx"))) continue; // the page a refused member lands on
      const src = readFileSync(p, "utf8");
      const gated = /pageAccess\(/.test(src) || (/(getSession\(\)|getServerSession\()/.test(src) && /redirect\(/.test(src) && /businessId/.test(src));
      expect(gated, `${p} has no access check`).toBe(true);
    }
  });
  it("the layout does not render for nobody: no session means no business data is read", () => {
    const src = readFileSync("app/dashboard/layout.tsx", "utf8");
    expect(src).toMatch(/session\?\.user\?\.businessId \|\| \(access && !access\.isOwner\)/);
  });
});

describe("pageAccess refuses what it should", () => {
  it("nobody signed in -> /login", async () => {
    await expect(pageAccess()).rejects.toMatchObject({ to: "/login" });
  });
  it("a signed-in user who is neither owner nor team member -> /login", async () => {
    session.current = { user: { id: "u9" } };
    db.teamMember.findUnique.mockResolvedValue(null);
    await expect(pageAccess("owner")).rejects.toMatchObject({ to: "/login" });
  });
  it("a customer session is nobody's team login", async () => {
    session.current = { user: { id: "c1", kind: "customer", businessId: "b1" } };
    expect(await resolveAccess(session.current as never)).toBeNull();
  });
  it("a member without the permission -> /dashboard/no-access, owner-only pages refuse every member", async () => {
    session.current = { user: { id: "m1" } };
    db.teamMember.findUnique.mockResolvedValue({ businessId: "b1", permissions: ["appointments.view_own"], staffId: "s1", roleName: "Stylist" });
    await expect(pageAccess("reports.view")).rejects.toMatchObject({ to: "/dashboard/no-access" });
    await expect(pageAccess("owner")).rejects.toMatchObject({ to: "/dashboard/no-access" });
    await expect(pageAccess(["appointments.view_all", "appointments.view_own"])).resolves.toMatchObject({ access: { isOwner: false, businessId: "b1" } });
  });
  it("the owner passes; a removed member is refused on the next request (nothing is remembered across requests)", async () => {
    session.current = { user: { id: "o1", businessId: "b1" } };
    await expect(pageAccess("owner")).resolves.toMatchObject({ access: { isOwner: true } });
    session.current = { user: { id: "m1" } };
    db.teamMember.findUnique.mockResolvedValueOnce({ businessId: "b1", permissions: ["reports.view"], staffId: null, roleName: "Manager" });
    await expect(pageAccess("reports.view")).resolves.toBeTruthy();
    session.current = { user: { id: "m1" } }; // a new request: a new session object, so the lookup runs again
    db.teamMember.findUnique.mockResolvedValueOnce(null);
    await expect(pageAccess("reports.view")).rejects.toMatchObject({ to: "/login" });
  });
});
