import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique } } }));

import { isReservedSlug, RESERVED_SLUGS } from "@/lib/slugs";
import { generateSlug } from "@/lib/createBusiness";

describe("reserved slugs", () => {
  it("covers every top-level route folder in app/", () => {
    const dirs = fs
      .readdirSync(path.join(__dirname, "..", "app"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
      .map((d) => d.name);
    for (const d of dirs) expect(RESERVED_SLUGS.has(d), d).toBe(true);
  });
  it("blocks the named examples, case-insensitively", () => {
    for (const s of ["admin", "www", "api", "app", "dashboard", "login", "signup", "blog", "help", "b", "crm", "onboarding", "ADMIN"]) {
      expect(isReservedSlug(s), s).toBe(true);
    }
    expect(isReservedSlug("glow-salon")).toBe(false);
  });
});

describe("generateSlug", () => {
  beforeEach(() => findUnique.mockReset());
  it("never returns a reserved word", async () => {
    findUnique.mockResolvedValue(null);
    expect(await generateSlug("Admin")).toBe("admin-2");
    expect(await generateSlug("Dashboard")).toBe("dashboard-2");
  });
  it("returns the plain slug when free and not reserved", async () => {
    findUnique.mockResolvedValue(null);
    expect(await generateSlug("Glow Salon")).toBe("glow-salon");
  });
  it("appends a suffix when taken", async () => {
    findUnique.mockResolvedValueOnce({ id: "x" }).mockResolvedValue(null);
    expect(await generateSlug("Glow Salon")).toBe("glow-salon-2");
  });
});
