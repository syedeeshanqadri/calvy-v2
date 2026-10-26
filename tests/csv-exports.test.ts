import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

// Every CSV export is built on the server behind the plan's CSV flag (applyEnforcement), and
// nothing is generated in the browser.

const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  planConfig: { findUnique: vi.fn() },
  appointment: { findMany: vi.fn() },
}));
const session = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));

import { GET as appointmentsExport } from "@/app/api/appointments/export/route";
import { GET as paymentsExport } from "@/app/api/payments/export/route";

const appt = {
  date: new Date("2026-10-20T10:00:00Z"), duration: 30, price: 500, status: "confirmed", paymentStatus: "paid", paymentMode: "prepaid", notes: null,
  client: { name: "=cmd()", email: "a@x.com", phone: "+919800000001" }, service: { name: "Cut" }, staff: { name: "Sam" },
};

const ROUTES = [
  ["appointments", () => appointmentsExport(new NextRequest("http://localhost/api/appointments/export"))],
  ["payments", () => paymentsExport()],
] as const;

function business(plan: string) {
  db.business.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
    args?.select?.plan
      ? { plan, planStatus: plan === "free" ? "free" : "active", trialEndsAt: null, timezone: "Asia/Kolkata" }
      : { timezone: "Asia/Kolkata", currency: "INR" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_PAYMENTS", "1");
  session.current = { user: { id: "u1", businessId: "b1" } };
  db.planConfig.findUnique.mockResolvedValue(null); // the code defaults apply
  db.appointment.findMany.mockResolvedValue([appt]);
});
afterEach(() => vi.unstubAllEnvs());

describe.each(ROUTES)("%s export", (_name, call) => {
  it("enforcement ON: refused for Free, nothing read", async () => {
    vi.stubEnv("PLAN_ENFORCEMENT", "1");
    business("free");
    const res = await call();
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("FEATURE_LOCKED");
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });
  it("enforcement ON: allowed for a paid plan, as a formula-safe CSV attachment", async () => {
    vi.stubEnv("PLAN_ENFORCEMENT", "1");
    business("professional");
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.csv"/);
    const text = await res.text();
    expect(text).toContain("\"'=cmd()\"");
    expect(text).not.toContain(",\"=cmd()\"");
  });
  it("enforcement OFF: allowed even for Free", async () => {
    vi.stubEnv("PLAN_ENFORCEMENT", "");
    business("free");
    expect((await call()).status).toBe(200);
  });
  it("signed out: 401", async () => {
    session.current = null;
    expect((await call()).status).toBe(401);
  });
  it("enforcement ON: an expired paid plan is refused too", async () => {
    vi.stubEnv("PLAN_ENFORCEMENT", "1");
    db.business.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
      args?.select?.plan ? { plan: "professional", planStatus: "past_due", trialEndsAt: null, timezone: "Asia/Kolkata" } : { timezone: "Asia/Kolkata", currency: "INR" });
    expect((await call()).status).toBe(402);
  });
});

describe("payments export needs the payments feature", () => {
  it("404 when the payments flag is off", async () => {
    vi.stubEnv("FEATURE_PAYMENTS", "");
    vi.stubEnv("PLAN_ENFORCEMENT", "");
    business("professional");
    expect((await paymentsExport()).status).toBe(404);
  });
});

describe("no CSV is generated in the browser", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(name)) out.push(full);
    }
    return out;
  }
  it("no client component builds a Blob or object URL for a download", () => {
    const root = path.resolve(__dirname, "..");
    const offenders = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))].filter((f) => {
      const src = readFileSync(f, "utf8");
      return /URL\.createObjectURL|new Blob\(/.test(src);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
